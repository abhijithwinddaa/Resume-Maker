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
 * Abort a specific request by key.
 */
export function abortRequest(key: string): void {
  const controller = activeRequests.get(key);
  if (controller) {
    controller.abort();
    activeRequests.delete(key);
  }
}

/**
 * Check if a request is currently in flight for a given key.
 */
export function isRequestInFlight(key: string): boolean {
  const controller = activeRequests.get(key);
  return !!controller && !controller.signal.aborted;
}

/**
 * Abort all in-flight requests.
 */
export function abortAllRequests(): void {
  for (const [key, controller] of activeRequests) {
    controller.abort();
    activeRequests.delete(key);
  }
}
