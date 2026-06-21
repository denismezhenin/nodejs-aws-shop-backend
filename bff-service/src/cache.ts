const TTL_MS = 2 * 60 * 1000; // 2 minutes

interface CacheEntry {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/** Return a live (non-expired) entry, or undefined. Expired entries are evicted. */
export function getCached(key: string): CacheEntry | undefined {
  const entry = store.get(key);
  if (!entry) return;

  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return;
  }
  return entry;
}

/** Store a response under `key` with the 2-minute TTL. */
export function setCached(
  key: string,
  value: Omit<CacheEntry, 'expiresAt'>,
): void {
  store.set(key, { ...value, expiresAt: Date.now() + TTL_MS });
}

/**
 * Whether a request is cacheable: only the Product Service product LIST,
 * fetched via GET. Never single-product lookups, never cart (per-user/auth),
 * never mutating methods.
 */
export function isCacheable(
  method: string,
  service: string,
  restPath: string,
): boolean {
  return (
    method.toUpperCase() === 'GET' &&
    service === 'product' &&
    restPath === 'products'
  );
}
