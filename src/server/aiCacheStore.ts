import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { ATSResult } from "./aiParsing.js";
import type { ResumeData } from "../types/resume.js";

const CACHE_TTL_MS = 60 * 60 * 1000;

const inFlightRequests = new Map<string, Promise<unknown>>();

type EnvMap = Record<string, string | undefined>;

function getEnvMap(): EnvMap {
  return (
    (
      globalThis as typeof globalThis & {
        process?: { env?: EnvMap };
      }
    ).process?.env || {}
  );
}

function readEnv(...keys: string[]): string {
  const env = getEnvMap();
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getSupabaseAdminClient() {
  const supabaseUrl = readEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function buildPayloadHash(value: unknown): string {
  return hashString(JSON.stringify(value));
}

function buildJobHash(jobDescription?: string): string {
  return hashString(jobDescription?.trim() || "");
}

export function buildAnalyzeCacheKey(
  mode: "jd" | "self",
  resumeData: ResumeData,
  jobDescription?: string,
): string {
  return [
    "analyze",
    "v2",
    mode,
    buildPayloadHash(resumeData),
    buildJobHash(jobDescription),
  ].join(":");
}

export function buildRewriteCacheKey(
  mode: "jd" | "self",
  resumeData: ResumeData,
  jobDescription: string | undefined,
  atsResult: ATSResult,
  iteration: number,
  promptVersion: string,
): string {
  return [
    "rewrite",
    "v1",
    mode,
    buildPayloadHash(resumeData),
    buildJobHash(jobDescription),
    buildPayloadHash(atsResult),
    String(iteration),
    promptVersion,
  ].join(":");
}

export function buildParseCacheKey(
  resumeText: string,
  extractedLinks?: string[],
): string {
  return [
    "parse",
    "v2",
    hashString(resumeText.trim()),
    hashString(JSON.stringify(extractedLinks || [])),
  ].join(":");
}

export function buildTemplateDetectCacheKey(resumeText: string): string {
  return ["template-detect", "v2", hashString(resumeText.trim())].join(":");
}

export function buildCoverLetterCacheKey(
  resumeText: string,
  jobDescription: string,
  companyName: string,
  position: string,
): string {
  return [
    "cover-letter",
    "v1",
    hashString(resumeText.trim()),
    hashString(jobDescription.trim()),
    hashString(companyName.trim().toLowerCase()),
    hashString(position.trim().toLowerCase()),
  ].join(":");
}

function getExpiryIso(): string {
  return new Date(Date.now() + CACHE_TTL_MS).toISOString();
}

export function isCacheExpired(expiresAt: string, now = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now;
}

export async function readServerCache<T>(cacheKey: string): Promise<T | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("ai_response_cache")
    .select("payload, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (isCacheExpired(data.expires_at)) {
    await supabase.from("ai_response_cache").delete().eq("cache_key", cacheKey);
    return null;
  }

  return data.payload as T;
}

export async function writeServerCache(
  operation: string,
  cacheKey: string,
  payload: unknown,
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("ai_response_cache").upsert(
    {
      cache_key: cacheKey,
      operation,
      payload,
      created_at: new Date().toISOString(),
      expires_at: getExpiryIso(),
    },
    { onConflict: "cache_key" },
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function raceSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Shares one in-flight computation per cache key. The first caller's factory
 * may be bound to that caller's AbortSignal, so a joiner must not inherit its
 * failure: if the shared work died from an abort that is not the joiner's own,
 * the joiner runs its own factory. Pass `signal` (the caller's own) so each
 * caller can also stop waiting independently of the shared work.
 */
export async function withInFlightDedup<T>(
  cacheKey: string,
  factory: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    try {
      return await raceSignal(existing as Promise<T>, signal);
    } catch (error) {
      if (signal?.aborted || !isAbortError(error)) {
        throw error;
      }
      return withInFlightDedup(cacheKey, factory, signal);
    }
  }

  const pending: Promise<T> = factory().finally(() => {
    if (inFlightRequests.get(cacheKey) === pending) {
      inFlightRequests.delete(cacheKey);
    }
  });

  inFlightRequests.set(cacheKey, pending);
  return raceSignal(pending, signal);
}
