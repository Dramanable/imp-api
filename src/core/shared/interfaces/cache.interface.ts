/**
 * Port for a generic key-value cache with optional per-entry TTL.
 *
 * Implementations are responsible for expiry. A `get()` call on an expired
 * entry MUST return `null` and SHOULD remove the entry from storage.
 */
export interface ICacheService {
  /**
   * Retrieves a cached value by key.
   * Returns `null` if the key does not exist or has expired.
   */
  get<T>(key: string): T | null;

  /**
   * Stores a value under the given key.
   * @param ttlMs - Optional TTL in milliseconds. Falls back to the implementation default.
   */
  set<T>(key: string, value: T, ttlMs?: number): void;
}

/** NestJS DI injection token for the cache service. */
export const CACHE_SERVICE = Symbol('CACHE_SERVICE');
