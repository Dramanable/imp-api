import type Redis from 'ioredis';
import { ICacheService } from '../../../core/shared/interfaces/cache.interface';

/**
 * Production cache adapter backed by Redis via ioredis.
 *
 * Values are serialised to JSON on write and deserialised on read.
 * Redis TTLs are expressed in milliseconds (PSETEX command).
 *
 * If the Redis connection is unavailable the service will surface the error
 * to the caller — the use-case layer should handle it gracefully.
 */
export class RedisCacheService implements ICacheService {
  constructor(
    private readonly client: Redis,
    private readonly defaultTtlMs: number,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    await this.client.psetex(key, ttl, JSON.stringify(value));
  }
}
