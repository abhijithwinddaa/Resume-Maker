import { getSupabaseAdminClient } from "./supabaseAdmin.js";

/**
 * Per-user cap on AI requests, enforced on the server.
 *
 * The client-side cooldown is a UX nicety anyone can bypass with curl; the
 * free provider quotas behind every AI route are shared by all users, so one
 * script could drain them for everyone.
 *
 * The authoritative counter lives in Postgres (`consume_ai_rate_limit`, see
 * supabase-rate-limit-and-stats-migration.sql), so it holds across every
 * serverless instance. An in-memory sliding window runs first as a cheap
 * pre-check (a user already over the limit locally never hits the DB). If the
 * database is not configured, errors, or answers slower than ~1.5 s, we fall
 * back to the in-memory window alone. That fallback is per warm instance only,
 * so it is best-effort rather than global.
 */

/** A full optimize session is ~10 calls (parse, detect, scans, rewrites). */
export const AI_REQUESTS_PER_WINDOW = 30;
const WINDOW_MS = 10 * 60_000;
const DB_TIMEOUT_MS = 1_500;

/** Bound the map so idle users don't accumulate on a long-lived instance. */
const MAX_TRACKED_USERS = 5_000;

const requestLog = new Map<string, number[]>();
let warnedFallback = false;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Test hook: forget every user's history. */
export function resetAIRateLimits(): void {
  requestLog.clear();
  warnedFallback = false;
}

function checkLocalWindow(userId: string, record: boolean): RateLimitResult {
  const now = Date.now();
  const recent = (requestLog.get(userId) || []).filter(
    (at) => now - at < WINDOW_MS,
  );

  if (recent.length >= AI_REQUESTS_PER_WINDOW) {
    requestLog.set(userId, recent);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((recent[0] + WINDOW_MS - now) / 1000),
    };
  }

  if (record) {
    if (!requestLog.has(userId) && requestLog.size >= MAX_TRACKED_USERS) {
      // Maps iterate in insertion order: drop the longest-tracked user.
      const oldest = requestLog.keys().next().value;
      if (oldest !== undefined) requestLog.delete(oldest);
    }
    requestLog.set(userId, [...recent, now]);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

function warnFallbackOnce(reason: string): void {
  if (warnedFallback) return;
  warnedFallback = true;
  console.warn(
    `[rateLimit] shared limiter unavailable (${reason}); using per-instance in-memory limit.`,
  );
}

async function consumeSharedLimit(
  userId: string,
): Promise<RateLimitResult | null> {
  const client = getSupabaseAdminClient();
  if (!client) {
    warnFallbackOnce("Supabase not configured");
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS);
    });
    const call = Promise.resolve(
      client.rpc("consume_ai_rate_limit", {
        p_user_id: userId,
        p_limit: AI_REQUESTS_PER_WINDOW,
        p_window_seconds: WINDOW_MS / 1000,
      }),
    );
    const { data, error } = await Promise.race([call, timeout]);
    if (error) throw new Error(error.message || "rpc error");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") {
      throw new Error("unexpected response");
    }
    return {
      allowed: row.allowed,
      retryAfterSeconds: row.allowed
        ? 0
        : Math.max(1, Number(row.retry_after_seconds) || 1),
    };
  } catch (err) {
    warnFallbackOnce(err instanceof Error ? err.message : "unknown error");
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkAIRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  // Fast path: already over the limit on this instance, no DB round trip.
  const local = checkLocalWindow(userId, false);
  if (!local.allowed) return local;

  const shared = await consumeSharedLimit(userId);
  if (shared) {
    // Mirror into the local window so the fast path stays useful.
    if (shared.allowed) checkLocalWindow(userId, true);
    return shared;
  }
  return checkLocalWindow(userId, true);
}

/** The 429 every AI route returns once a user is over their budget. */
export function rateLimitedResponse(retryAfterSeconds: number): Response {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new Response(
    JSON.stringify({
      error: `You've made a lot of AI requests in a short time. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
