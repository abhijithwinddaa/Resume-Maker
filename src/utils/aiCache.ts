/* ─── AI Response Cache ────────────────────────────────
   Caches AI responses in localStorage (sync fallback) and
   IndexedDB (async, larger capacity). Avoids redundant
   API calls for identical resume + JD combinations.
   ────────────────────────────────────────────────────── */

import { idbGetCached, idbSetCache } from "./indexedDB";

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
 * Checks localStorage (sync) first, then IndexedDB (async).
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
 * Async version that also checks IndexedDB if localStorage misses.
 */
export async function getCachedAsync<T>(key: string): Promise<T | null> {
  // Try localStorage first (fast, sync)
  const syncResult = getCached<T>(key);
  if (syncResult !== null) return syncResult;

  // Fall back to IndexedDB
  const idbResult = await idbGetCached<T>(key);
  if (idbResult !== null) {
    // Re-populate localStorage for faster future reads
    try {
      const entry: CacheEntry<T> = { data: idbResult, timestamp: Date.now() };
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      /* ignore */
    }
  }
  return idbResult;
}

/**
 * Store a response in cache (localStorage + IndexedDB).
 */
export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(entry));

    // Evict old entries
    evictOldEntries();
  } catch {
    // localStorage full or unavailable — silently ignore
  }

  // Also persist to IndexedDB (async, fire-and-forget)
  idbSetCache(key, data).catch(() => {});
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
