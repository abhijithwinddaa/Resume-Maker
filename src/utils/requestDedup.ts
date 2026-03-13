/* ─── Request Deduplication ────────────────────────────
   Prevents duplicate in-flight API requests. If a request
   is already in progress for a given key, the previous
   one is aborted via AbortController.
   ────────────────────────────────────────────────────── */

const activeRequests = new Map<string, AbortController>();

/**
 * Get or create an AbortController for a given request key.
 * If a request is already in flight for this key, it will
 * be aborted before creating a new one.
 */
export function getRequestController(key: string): AbortController {
  // Abort any existing request with the same key
  const existing = activeRequests.get(key);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  activeRequests.set(key, controller);
  return controller;
}

/**
 * Clear the controller for a request key (call when request completes).
 */
export function clearRequestController(key: string): void {
  activeRequests.delete(key);
}

/**
 * Abort and clear a request by key. Safe to call even if no request exists.
 */
export function abortRequestController(key: string): void {
  const existing = activeRequests.get(key);
  if (existing) {
    existing.abort();
    activeRequests.delete(key);
  }
}
