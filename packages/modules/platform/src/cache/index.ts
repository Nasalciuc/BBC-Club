import type { Redis } from "../redis/client";

type Guarded = <T>(fn: () => Promise<T>, fallback: () => Promise<T>) => Promise<T>;
type Metrics = { inc(name: string, labels?: Record<string, string>): void };

/** Cache-aside. No Redis → load() every time. generation() is null so callers keep a process cache. */
export function createCache(deps: { redis: Redis | null; guarded: Guarded; metrics: Metrics }) {
  const inflight = new Map<string, Promise<unknown>>();

  return {
    async getOrLoad<T>(key: string, ttlS: number, load: () => Promise<T>): Promise<T> {
      const redis = deps.redis;
      if (!redis) return load();
      const hit = await deps.guarded(
        () => redis.get(key),
        async () => null,
      );
      if (hit != null) {
        deps.metrics.inc("cache_hit", { ns: key.split(":")[0] ?? "cache" });
        return JSON.parse(hit) as T;
      }
      const running = inflight.get(key);
      if (running) return running as Promise<T>;
      const p = load()
        .then(async (value) => {
          const ttl = Math.max(1, Math.floor(ttlS * (0.9 + Math.random() * 0.2)));
          await deps.guarded(
            () => redis.set(key, JSON.stringify(value), { EX: ttl }),
            async () => null,
          );
          return value;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, p);
      deps.metrics.inc("cache_miss", { ns: key.split(":")[0] ?? "cache" });
      return p;
    },
    async invalidate(...keys: string[]) {
      const redis = deps.redis;
      if (redis && keys.length)
        await deps.guarded(
          () => redis.del(keys),
          async () => 0,
        );
    },
    async bump(key: string) {
      const redis = deps.redis;
      if (!redis) return;
      await deps.guarded(
        () => redis.incr(key),
        async () => 0,
      );
    },
    async generation(key: string): Promise<string | null> {
      const redis = deps.redis;
      if (!redis) return null;
      return deps.guarded(
        () => redis.get(key),
        async () => null,
      );
    },
  };
}

export type Cache = ReturnType<typeof createCache>;
