export interface ICacheService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlMs?: number): void;
}

export const CACHE_SERVICE = Symbol('CACHE_SERVICE');
