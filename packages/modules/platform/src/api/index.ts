import { EventRegistry, createPublisher, createPoller, tombstoneMember, type PollerOptions } from "../events";
import { createFlags } from "../flags";
import { createJobs } from "../jobs";
import { createLogger, createMetrics } from "../telemetry";
import { createRateLimiter } from "../ratelimit";
import { createCache } from "../cache";
import { createBreaker, createRedis, type Redis } from "../redis/client";
import type { Db } from "@bbc/db";

export type Platform = ReturnType<typeof createPlatform>;

/** The only surface other modules and the host may import from platform.
 *  Modules get `events.publish`, `flags`, `jobs.register`; the host also gets the poller and metrics. */
export function createPlatform(
  db: Db,
  opts: {
    level?: string;
    pretty?: boolean;
    handlerTimeoutMs?: number;
    onDead?: PollerOptions["onDead"];
    redisUrl?: string;
  } = {},
) {
  const logger = createLogger(opts);
  const metrics = createMetrics();
  const redisUrl = opts.redisUrl?.trim() || "";
  const redis: Redis | null = redisUrl ? createRedis(redisUrl, logger) : null;
  const guarded = createBreaker(metrics);
  const cache = createCache({ redis, guarded, metrics });
  const registry = new EventRegistry();
  const flags = createFlags(db, { logger, cache: redis ? cache : undefined });
  const jobs = createJobs(db, { logger, metrics });
  const rateLimit = createRateLimiter({ db, flags, metrics, logger, redis });
  const { publish } = createPublisher(registry, metrics);
  const poller = createPoller(
    db,
    registry,
    {
      logger,
      metrics,
      isPaused: (consumer) => flags.isConsumerPaused(consumer),
    },
    {
      handlerTimeoutMs: opts.handlerTimeoutMs,
      onDead:
        opts.onDead ?? (({ consumer, eventId }) => logger.error({ consumer, eventId }, "DLQ: manual replay required")),
    },
  );

  let statsAt = 0;
  let statsP: ReturnType<typeof poller.stats> | null = null;
  /** The three gauges share one stats() per 2 s — a scrape must not run the same query three times. */
  const stats = () => {
    if (!statsP || Date.now() - statsAt > 2_000) {
      statsAt = Date.now();
      statsP = poller.stats().catch((e) => {
        statsP = null;
        throw e;
      });
    }
    return statsP;
  };
  metrics.gauge("queue_pending", async () => (await stats()).pending);
  metrics.gauge("queue_dead", async () => (await stats()).dead);
  metrics.gauge("queue_oldest_pending_seconds", async () => (await stats()).oldestPendingSeconds);

  return {
    logger,
    metrics,
    flags,
    jobs,
    rateLimit,
    poller,
    redis,
    guarded,
    cache,
    events: {
      defineEvent: registry.defineEvent.bind(registry),
      registerConsumer: registry.registerConsumer.bind(registry),
      publish,
      tombstoneMember,
      registry,
    },
    /** Called by /ready: the platform is healthy when the DB answers and the queue is not stuck. */
    async connect() {
      if (!redis) return;
      await redis
        .connect()
        .catch((err) => logger.warn({ err: String(err) }, "redis connect failed; callers fall back"));
    },
    async health() {
      const s = await poller.stats();
      return { ok: s.oldestPendingSeconds < 300 && s.dead === 0, queue: s };
    },
    async close() {
      if (redis) await redis.close().catch((err) => logger.warn({ err: String(err) }, "redis close failed"));
    },
  };
}

export { type Handler, type HandlerContext, type EventDefinition } from "../events/registry";
export { type Flags } from "../flags";
export { type Jobs, type JobContext } from "../jobs";
export { type Logger, type Metrics, DURATION_BUCKETS_MS } from "../telemetry";
export { pollerClaimSql, pollerStatsSql } from "../events/poller";
export { collectDbReport, maybeAlertOps, pgbouncerWaitingClients, resetDbAlertState } from "../observe/db-health";

/** The host imports this from "@bbc/platform"; it is defined in jobs/builtin.ts. */
export { registerPlatformJobs } from "../jobs/builtin";
