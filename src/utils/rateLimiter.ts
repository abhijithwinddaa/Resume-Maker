/* ─── Client-Side Rate Limiter ─────────────────────────
   Prevents users from spamming AI calls.
   Tracks last call time and enforces a cooldown period.
   ────────────────────────────────────────────────────── */

const cooldowns: Map<string, number> = new Map();

/**
 * Check if an action is currently rate limited.
 * @param action - identifier for the action (e.g., "analyze", "optimize")
 * @param cooldownMs - cooldown period in milliseconds
 * @returns remaining cooldown in ms, or 0 if not limited
 */
export function getRateLimitRemaining(
  action: string,
  cooldownMs: number = 30000,
): number {
  const lastCall = cooldowns.get(action);
  if (!lastCall) return 0;
  const elapsed = Date.now() - lastCall;
  return Math.max(0, cooldownMs - elapsed);
}

/**
 * Check if rate limited (boolean convenience).
 */
export function isRateLimited(
  action: string,
  cooldownMs: number = 30000,
): boolean {
  return getRateLimitRemaining(action, cooldownMs) > 0;
}

/**
 * Record that an action was performed (starts cooldown).
 */
export function recordAction(action: string): void {
  cooldowns.set(action, Date.now());
}

/**
 * Reset cooldown for an action.
 */
export function resetCooldown(action: string): void {
  cooldowns.delete(action);
}

/**
 * Format remaining time as human-readable string.
 */
export function formatCooldown(remainingMs: number): string {
  const seconds = Math.ceil(remainingMs / 1000);
  return `${seconds}s`;
}
