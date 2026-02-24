/* ─── AI Response Cache ────────────────────────────────
   Caches AI responses in localStorage using a hash of the input.
   Avoids redundant API calls for identical resume + JD combinations.
   ────────────────────────────────────────────────────── */

const CACHE_PREFIX = "ai_cache_";
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 20;

/**
 * Simple hash function for cache keys (djb2).
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Generate a cache key from operation type + input data.
 */
export function getCacheKey(operation: string, ...inputs: string[]): string {
  const combined = `${operation}:${inputs.join("|")}`;
  return CACHE_PREFIX + hashString(combined);
}

/**
 * Get a cached response if it exists and hasn't expired.
 */
export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;
    const age = Date.now() - entry.timestamp;

    if (age > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Store a response in cache.
 */
export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(entry));

    // Evict old entries if we have too many
    evictOldEntries();
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Clear all AI cache entries.
 */
export function clearAICache(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      keys.push(key);
    }
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

/**
 * Evict oldest cache entries when limit exceeded.
 */
function evictOldEntries(): void {
  const entries: { key: string; timestamp: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CACHE_PREFIX)) continue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const entry = JSON.parse(raw) as CacheEntry<unknown>;
      entries.push({ key, timestamp: entry.timestamp });
    } catch {
      // Corrupt entry — remove it
      if (key) localStorage.removeItem(key);
    }
  }

  if (entries.length <= MAX_CACHE_ENTRIES) return;

  // Sort by timestamp (oldest first) and remove excess
  entries.sort((a, b) => a.timestamp - b.timestamp);
  const toRemove = entries.length - MAX_CACHE_ENTRIES;
  for (let i = 0; i < toRemove; i++) {
    localStorage.removeItem(entries[i].key);
  }
}
