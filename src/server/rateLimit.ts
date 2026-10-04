/**
 * Per-user cap on AI requests, enforced on the server.
 *
 * The client-side cooldown is a UX nicety anyone can bypass with curl; the
 * free provider quotas behind every AI route are shared by all users, so one
 * script could drain them for everyone. This sliding window lives in module
 * state: it holds per warm serverless instance rather than globally, which is
 * enough to stop a single client hammering the API.
 */

/** A full optimize session is ~10 calls (parse, detect, scans, rewrites). */
export const AI_REQUESTS_PER_WINDOW = 30;
const WINDOW_MS = 10 * 60_000;

/** Bound the map so idle users don't accumulate on a long-lived instance. */
const MAX_TRACKED_USERS = 5_000;

const requestLog = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Test hook: forget every user's history. */
export function resetAIRateLimits(): void {
  requestLog.clear();
}

export function checkAIRateLimit(userId: string): RateLimitResult {
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

  if (!requestLog.has(userId) && requestLog.size >= MAX_TRACKED_USERS) {
    // Maps iterate in insertion order: drop the longest-tracked user.
    const oldest = requestLog.keys().next().value;
    if (oldest !== undefined) requestLog.delete(oldest);
  }

  requestLog.set(userId, [...recent, now]);
  return { allowed: true, retryAfterSeconds: 0 };
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
