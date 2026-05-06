import { Injectable } from '@nestjs/common';
import { ICacheService } from '../../../core/shared/interfaces/cache.interface';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class InMemoryCacheService implements ICacheService {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly defaultTtlMs: number;

  constructor(ttlMs = 3_600_000) {
    this.defaultTtlMs = ttlMs;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }
}
