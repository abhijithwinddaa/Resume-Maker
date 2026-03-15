/* ─── IndexedDB Storage ────────────────────────────────
   Replaces localStorage for large data (resume cache,
   AI responses) to avoid the 5MB localStorage limit.
   Uses a simple key-value store backed by IndexedDB.
   ────────────────────────────────────────────────────── */

const DB_NAME = "resume_maker_db";
const DB_VERSION = 1;
const STORE_NAME = "kv_store";

let dbInstance: IDBDatabase | null = null;

/**
 * Open (or create) the IndexedDB database.
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Get a value from IndexedDB.
 */
export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Set a value in IndexedDB.
 */
export async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail
  }
}

/**
 * Delete a value from IndexedDB.
 */
export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

/**
 * Get all keys in IndexedDB store.
 */
export async function idbKeys(): Promise<string[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result.map((k) => String(k)));
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Clear all data from IndexedDB store.
 */
export async function idbClear(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

/* ─── Cache helpers (replacing localStorage-based aiCache) ─── */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const IDB_CACHE_PREFIX = "ai_cache_";
const IDB_CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const IDB_MAX_CACHE_ENTRIES = 50; // More generous than localStorage

/**
 * Get a cached AI response from IndexedDB.
 */
export async function idbGetCached<T>(key: string): Promise<T | null> {
  const entry = await idbGet<CacheEntry<T>>(IDB_CACHE_PREFIX + key);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > IDB_CACHE_MAX_AGE_MS) {
    await idbDelete(IDB_CACHE_PREFIX + key);
    return null;
  }

  return entry.data;
}

/**
 * Store an AI response in IndexedDB cache.
 */
export async function idbSetCache<T>(key: string, data: T): Promise<void> {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  await idbSet(IDB_CACHE_PREFIX + key, entry);

  // Evict old entries
  await idbEvictOldEntries();
}

export async function clearIDBAICache(): Promise<void> {
  try {
    const allKeys = await idbKeys();
    const cacheKeys = allKeys.filter((key) => key.startsWith(IDB_CACHE_PREFIX));

    await Promise.all(cacheKeys.map((key) => idbDelete(key)));
  } catch {
    // Silently fail
  }
}

/**
 * Evict oldest cache entries if we exceed the limit.
 */
async function idbEvictOldEntries(): Promise<void> {
  try {
    const allKeys = await idbKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith(IDB_CACHE_PREFIX));

    if (cacheKeys.length <= IDB_MAX_CACHE_ENTRIES) return;

    // Load timestamps and sort
    const entries: { key: string; timestamp: number }[] = [];
    for (const key of cacheKeys) {
      const entry = await idbGet<CacheEntry<unknown>>(key);
      if (entry) {
        entries.push({ key, timestamp: entry.timestamp });
      }
    }

    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Delete oldest entries
    const toDelete = entries.slice(0, entries.length - IDB_MAX_CACHE_ENTRIES);
    for (const { key } of toDelete) {
      await idbDelete(key);
    }
  } catch {
    // Silently fail
  }
}
