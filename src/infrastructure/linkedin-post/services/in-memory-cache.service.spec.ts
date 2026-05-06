import { InMemoryCacheService } from './in-memory-cache.service';

describe('InMemoryCacheService', () => {
  let cache: InMemoryCacheService;

  beforeEach(() => {
    cache = new InMemoryCacheService();
  });

  it('should return null for a key that does not exist', async () => {
    expect(await cache.get('missing-key')).toBeNull();
  });

  it('should store and retrieve a value', async () => {
    await cache.set('key', { foo: 'bar' });
    expect(await cache.get('key')).toEqual({ foo: 'bar' });
  });

  it('should return null for an expired entry', async () => {
    await cache.set('key', 'value', 10); // 10ms TTL

    await new Promise((r) => setTimeout(r, 20));

    expect(await cache.get('key')).toBeNull();
  });

  it('should not expire an entry before its TTL', async () => {
    await cache.set('key', 'value', 500); // 500ms TTL

    await new Promise((r) => setTimeout(r, 10));

    expect(await cache.get('key')).toBe('value');
  });

  it('should overwrite an existing entry on set', async () => {
    await cache.set('key', 'first');
    await cache.set('key', 'second');
    expect(await cache.get('key')).toBe('second');
  });

  it('should handle different types of values', async () => {
    await cache.set('str', 'hello');
    await cache.set('num', 42);
    await cache.set('arr', [1, 2, 3]);
    await cache.set('obj', { a: 1 });

    expect(await cache.get<string>('str')).toBe('hello');
    expect(await cache.get<number>('num')).toBe(42);
    expect(await cache.get<number[]>('arr')).toEqual([1, 2, 3]);
    expect(await cache.get<{ a: number }>('obj')).toEqual({ a: 1 });
  });

  it('should use the custom TTL when provided', async () => {
    const longTtlCache = new InMemoryCacheService(60_000);
    await longTtlCache.set('key', 'value');

    await new Promise((r) => setTimeout(r, 10));

    expect(await longTtlCache.get('key')).toBe('value');
  });
});
