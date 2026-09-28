import { EventRegistry, createPublisher, createPoller, tombstoneMember, type PollerOptions } from "../events";
import { createFlags } from "../flags";
import { createJobs } from "../jobs";
import { createLogger, createMetrics } from "../telemetry";
import { createRateLimiter } from "../ratelimit";
import type { Db } from "@bbc/db";

export type Platform = ReturnType<typeof createPlatform>;

/** The only surface other modules and the host may import from platform.
 *  Modules get `events.publish`, `flags`, `jobs.register`; the host also gets the poller and metrics. */
export function createPlatform(
  db: Db,
  opts: { level?: string; pretty?: boolean; handlerTimeoutMs?: number; onDead?: PollerOptions["onDead"] } = {},
) {
  const logger = createLogger(opts);
  const metrics = createMetrics();
  const registry = new EventRegistry();
  const flags = createFlags(db, { logger });
  const jobs = createJobs(db, { logger, metrics });
  const rateLimit = createRateLimiter({ db, flags, metrics, logger });
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
    events: {
      defineEvent: registry.defineEvent.bind(registry),
      registerConsumer: registry.registerConsumer.bind(registry),
      publish,
      tombstoneMember,
      registry,
    },
    /** Called by /ready: the platform is healthy when the DB answers and the queue is not stuck. */
    async health() {
      const s = await poller.stats();
      return { ok: s.oldestPendingSeconds < 300 && s.dead === 0, queue: s };
    },
  };
}

export { type Handler, type HandlerContext, type EventDefinition } from "../events/registry";
export { type Flags } from "../flags";
export { type Jobs, type JobContext } from "../jobs";
export { type Logger, type Metrics } from "../telemetry";
export { pollerClaimSql, pollerStatsSql } from "../events/poller";
export { collectDbReport, maybeAlertOps, resetDbAlertState } from "../observe/db-health";

/** The host imports this from "@bbc/platform"; it is defined in jobs/builtin.ts. */
export { registerPlatformJobs } from "../jobs/builtin";
