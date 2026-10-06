/* ─── App entry helpers ────────────────────────────────
   Pure helpers for the /app/ entry: the ?mode= deep link, and whether the
   visit came through the landing page.
   ────────────────────────────────────────────────────── */

import type { AppMode } from "../store/appStore";


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

/**
 * True when the visit came through a button on the landing page, which tags
 * its links `from=landing`. Those visitors should see the mode chooser, not
 * be forwarded into their saved resume.
 */
export function isFromLanding(search: string): boolean {
  return new URLSearchParams(search).get("from") === "landing";
}
