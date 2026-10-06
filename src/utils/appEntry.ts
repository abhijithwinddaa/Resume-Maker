/* ─── App entry helpers ────────────────────────────────
   Pure helpers for the /app/ entry: the ?mode= deep link from the landing
   page, and the rm_signed_in hint the landing page reads to skip itself.
   ────────────────────────────────────────────────────── */

import type { AppMode } from "../store/appStore";

export const SIGNED_IN_HINT_KEY = "rm_signed_in";

const DEEP_LINK_MODES = ["ats", "edit", "create"] as const;

/** Returns the mode named by `?mode=`, or null when absent or unknown. */
export function parseModeParam(search: string): AppMode {
  const value = new URLSearchParams(search).get("mode");
  return (DEEP_LINK_MODES as readonly string[]).includes(value ?? "")
    ? (value as AppMode)
    : null;
}

/** Removes only the `mode` param from a query string, keeping utm_* etc. */
export function stripModeParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("mode");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** "1" while a user id is known; removed when signed out. */
export function syncSignedInHint(userId: string | null | undefined): void {
  try {
    if (userId) localStorage.setItem(SIGNED_IN_HINT_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    // Storage unavailable: the landing falls back to the Clerk cookie.
  }
}
