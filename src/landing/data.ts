import type { LandingData } from "./types";

export const LANDING_CACHE_KEY = "rm_landing_v1";
export const LANDING_ENDPOINT = "/api/landing-data";
export const LANDING_TIMEOUT_MS = 2500;

function isLandingData(value: unknown): value is LandingData {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<LandingData>;
  return Array.isArray(v.reviews) && "rating" in v && "stats" in v;
}

function readCache(): LandingData | null {
  try {
    const raw = localStorage.getItem(LANDING_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLandingData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(data: LandingData): void {
  try {
    localStorage.setItem(LANDING_CACHE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable or full: the cache is only an optimisation
  }
}

/**
 * Stale-while-revalidate loader. Calls onData with the cached value first (if
 * any), then with fresh data. Resolves with the freshest value available, or
 * null when there is neither. Never rejects.
 */
export async function loadLandingData(
  onData?: (data: LandingData) => void,
): Promise<LandingData | null> {
  const cached = readCache();
  if (cached) onData?.(cached);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LANDING_TIMEOUT_MS);
  try {
    const res = await fetch(LANDING_ENDPOINT, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return cached;
    const fresh: unknown = await res.json();
    if (!isLandingData(fresh)) return cached;
    // Never replace good cached data with an empty degraded response.
    const empty = !fresh.rating && !fresh.stats && fresh.reviews.length === 0;
    if (empty) return cached;
    writeCache(fresh);
    onData?.(fresh);
    return fresh;
  } catch {
    return cached;
  } finally {
    clearTimeout(timer);
  }
}
