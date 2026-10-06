/* ─── Campaign attribution ─────────────────────────────
   Records a landing_campaign_attribution event once per session for a
   utm_source + utm_campaign visit. Shared by the static landing page ("/")
   and the app ("/app/"): both use the same sessionStorage dedupe key, so a
   visit counted on the landing isn't counted again in the app.
   Must stay free of React, Clerk and Supabase.
   ────────────────────────────────────────────────────── */

import { trackEvent } from "./analytics";

const STORAGE_KEY = "last_landing_campaign";

export function recordCampaignAttribution(entryPath: string): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const source = params.get("utm_source");
  const campaign = params.get("utm_campaign");
  if (!source || !campaign) return;

  const dedupeKey = `${source}:${campaign}:${params.get("utm_content") || ""}`;
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY) === dedupeKey) return;
  } catch {
    // Storage blocked: fall through and record (cannot dedupe).
  }

  trackEvent("landing_campaign_attribution", {
    utm_source: source,
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: campaign,
    utm_content: params.get("utm_content") || "",
    entry_path: entryPath,
  });

  try {
    window.sessionStorage.setItem(STORAGE_KEY, dedupeKey);
  } catch {
    // ignore
  }
}
