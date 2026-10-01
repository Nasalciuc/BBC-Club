import type { KafkaProducer } from "../kafka/producer";
import { SearchEvent } from "./event";

export const SEARCH_TOPIC = "bbc.search.v1";
const MAX = 10_000;
const BATCH = 500;

/** In-process buffer. The request path never awaits Kafka. Flag catalog.search_events defaults off. */
export function createSearchBuffer(deps: {
  producer: KafkaProducer | null;
  flags: { isEnabled(key: string, fallback?: boolean): Promise<boolean> };
  metrics: { inc(name: string, labels?: Record<string, string>): void };
  logger: { warn(o: object, m?: string): void };
}) {
  const buf: SearchEvent[] = [];
  let enabled = false;
  let flushing: Promise<void> | null = null;

  async function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      try {
        const flagOn = await deps.flags.isEnabled("catalog.search_events", false);
        enabled = deps.producer !== null && flagOn;
      } catch (err) {
        deps.logger.warn({ err: String(err) }, "search events flag unreadable");
        enabled = false;
      }
      const producer = deps.producer;
      if (!producer || !enabled || buf.length === 0) return;
      const batch = buf.splice(0, BATCH);
      try {
        await producer.send({
          messages: batch.map((event) => ({
            topic: SEARCH_TOPIC,
            value: Buffer.from(JSON.stringify(event)),
          })),
        });
      } catch (err) {
        deps.logger.warn({ err: String(err), n: batch.length }, "search events flush failed");
        deps.metrics.inc("search_events_dropped");
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    note(event: SearchEvent) {
      if (!enabled) return;
      const stamped = event.at ? event : { ...event, at: new Date().toISOString() };
      if (buf.length >= MAX) {
        buf.shift();
        deps.metrics.inc("search_events_dropped");
      }
      buf.push(stamped);
      if (buf.length >= BATCH) void flush();
    },
    start(signal: AbortSignal) {
      const timer = setInterval(() => {
        void flush();
      }, 1_000);
      signal.addEventListener("abort", () => clearInterval(timer), { once: true });
    },
  };
}
