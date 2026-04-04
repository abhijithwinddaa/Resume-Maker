import { createClient } from "@supabase/supabase-js";
import type { ATSResult } from "../utils/aiService";
import type { ResumeData } from "../types/resume";

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

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
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
    "v1",
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
    "v1",
    hashString(resumeText.trim()),
    hashString(JSON.stringify(extractedLinks || [])),
  ].join(":");
}

export function buildTemplateDetectCacheKey(resumeText: string): string {
  return ["template-detect", "v1", hashString(resumeText.trim())].join(":");
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

export async function withInFlightDedup<T>(
  cacheKey: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = factory().finally(() => {
    inFlightRequests.delete(cacheKey);
  });

  inFlightRequests.set(cacheKey, pending);
  return pending;
}
