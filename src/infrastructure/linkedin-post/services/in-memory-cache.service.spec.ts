import { InMemoryCacheService } from './in-memory-cache.service';

describe('InMemoryCacheService', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
  });

  it('should return null for a key that does not exist', () => {
    expect(cache.get('missing-key')).toBeNull();
  });

  it('should store and retrieve a value', () => {
    cache.set('key', { foo: 'bar' });
    expect(cache.get('key')).toEqual({ foo: 'bar' });
  });

  it('should return null for an expired entry', async () => {
    cache.set('key', 'value', 10); // 10ms TTL

    await new Promise((r) => setTimeout(r, 20));

    expect(cache.get('key')).toBeNull();
  });

  it('should not expire an entry before its TTL', async () => {
    cache.set('key', 'value', 500); // 500ms TTL

    await new Promise((r) => setTimeout(r, 10));

    expect(cache.get('key')).toBe('value');
  });

  it('should overwrite an existing entry on set', () => {
    cache.set('key', 'first');
    cache.set('key', 'second');
    expect(cache.get('key')).toBe('second');
  });

  it('should handle different types of values', () => {
    cache.set('str', 'hello');
    cache.set('num', 42);
    cache.set('arr', [1, 2, 3]);
    cache.set('obj', { a: 1 });

    expect(cache.get<string>('str')).toBe('hello');
    expect(cache.get<number>('num')).toBe(42);
    expect(cache.get<number[]>('arr')).toEqual([1, 2, 3]);
    expect(cache.get<{ a: number }>('obj')).toEqual({ a: 1 });
  });

  it('should use the custom TTL when provided', async () => {
    const longTtlCache = new InMemoryCacheService(60_000);
    longTtlCache.set('key', 'value');

    await new Promise((r) => setTimeout(r, 10));

    expect(longTtlCache.get('key')).toBe('value');
  });
});
