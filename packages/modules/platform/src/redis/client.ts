import { createClient } from "redis";

/** RESP3 + client-side caching. disableOfflineQueue: a dead socket fails the command at once. */
export function createRedis(url: string, logger: { warn(o: object, m?: string): void }) {
  const client = createClient({
    url,
    RESP: 3,
    clientSideCache: { ttl: 0, maxEntries: 10_000, evictPolicy: "LRU" },
    disableOfflineQueue: true,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 200, 5_000),
      connectTimeout: 2_000,
    },
  });
  client.on("error", (err) => logger.warn({ err: String(err) }, "redis error"));
  return client;
}

export type Redis = ReturnType<typeof createRedis>;

/** On any error, or while open, returns fallback() and does not call Redis again for 30s. */
export function createBreaker(metrics: { inc(name: string, labels?: Record<string, string>): void }) {
  let openUntil = 0;
  return async function guarded<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (Date.now() < openUntil) return fallback();
    try {
      return await fn();
    } catch {
      openUntil = Date.now() + 30_000;
      metrics.inc("redis_breaker_open");
      return fallback();
    }
  };
}
