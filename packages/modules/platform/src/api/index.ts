import { EventRegistry, createPublisher, createPoller, tombstoneMember } from "../events";
import { createFlags } from "../flags";
import { createJobs } from "../jobs";
import { createLogger, createMetrics } from "../telemetry";

export type Platform = ReturnType<typeof createPlatform>;

/** The only surface other modules and the host may import from platform.
 *  Modules get `events.publish`, `flags`, `jobs.register`; the host also gets the poller and metrics. */
export function createPlatform(db: any, opts: { level?: string; pretty?: boolean; handlerTimeoutMs?: number } = {}) {
  const logger = createLogger(opts);
  const metrics = createMetrics();
  const registry = new EventRegistry();
  const flags = createFlags(db, { logger });
  const jobs = createJobs(db, { logger, metrics });
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
      onDead: ({ consumer, eventId }) => logger.error({ consumer, eventId }, "DLQ: manual replay required"),
    },
  );

  metrics.gauge("queue_pending", async () => (await poller.stats()).pending);
  metrics.gauge("queue_dead", async () => (await poller.stats()).dead);
  metrics.gauge("queue_oldest_pending_seconds", async () => (await poller.stats()).oldestPendingSeconds);

  return {
    logger,
    metrics,
    flags,
    jobs,
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
export { type Jobs } from "../jobs";
export { type Logger, type Metrics } from "../telemetry";

/** The host imports this from "@bbc/platform"; it is defined in jobs/builtin.ts. */
export { registerPlatformJobs } from "../jobs/builtin";
