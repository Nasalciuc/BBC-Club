import { sql } from "drizzle-orm";
import { Consumer } from "@platformatic/kafka";
import type { Db } from "@bbc/db";

/** Capped exponential backoff. Attempt 0 waits 200ms, then 400, up to 60s. */
export function kafkaRetryDelayMs(attempt: number): number {
  return Math.min(60_000, 200 * 2 ** attempt);
}

async function sleepOrAbort(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(!signal.aborted);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Retries the same already-pulled message. commit runs only after apply succeeds. */
export async function retryUntilCommitted(opts: {
  signal: AbortSignal;
  apply: () => Promise<void>;
  commit: () => Promise<void>;
  onFailure: (err: unknown, delayMs: number) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<boolean>;
}): Promise<"ok" | "aborted"> {
  const sleep = opts.sleep ?? sleepOrAbort;
  let attempt = 0;
  for (;;) {
    if (opts.signal.aborted) return "aborted";
    try {
      await opts.apply();
      await opts.commit();
      return "ok";
    } catch (err) {
      if (opts.signal.aborted) return "aborted";
      const delayMs = kafkaRetryDelayMs(attempt);
      attempt += 1;
      opts.onFailure(err, delayMs);
      const keep = await sleep(delayMs, opts.signal);
      if (!keep || opts.signal.aborted) return "aborted";
    }
  }
}

/** Effect and the idempotency insert share one transaction. The offset commits only after that. */
export async function consumeIdempotent(opts: {
  db: Db;
  brokers: string;
  clientId: string;
  groupId: string;
  topic: string;
  consumerName: string;
  signal: AbortSignal;
  handle: (eventId: string, value: unknown, tx: unknown) => Promise<void>;
  logger?: { warn(o: object, m?: string): void };
  metrics?: { inc(name: string, labels?: Record<string, string>): void };
}): Promise<void> {
  const bootstrapBrokers = opts.brokers
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const consumer = new Consumer({
    clientId: opts.clientId,
    bootstrapBrokers,
    groupId: opts.groupId,
    autocommit: false,
  });
  const stream = await consumer.consume({
    topics: [opts.topic],
    mode: "earliest",
    autocommit: false,
  });
  const stop = () => {
    void consumer.close(true);
  };
  opts.signal.addEventListener("abort", stop, { once: true });
  try {
    for await (const message of stream) {
      if (opts.signal.aborted) break;
      const eventId = `${message.topic}:${message.partition}:${message.offset.toString()}`;
      let value: unknown = null;
      if (message.value && message.value.length > 0) {
        try {
          value = JSON.parse(message.value.toString("utf8"));
        } catch {
          value = null;
        }
      }
      const outcome = await retryUntilCommitted({
        signal: opts.signal,
        apply: () =>
          opts.db.transaction(async (tx) => {
            const inserted = (await tx.execute(sql`
              INSERT INTO ${sql.raw("platform.kafka_processed")} (${sql.raw("consumer")}, ${sql.raw("event_id")})
              VALUES (${opts.consumerName}, ${eventId})
              ON CONFLICT DO NOTHING
              RETURNING ${sql.raw("event_id")}
            `)) as unknown[];
            if (inserted.length === 0) return;
            await opts.handle(eventId, value, tx);
          }),
        commit: async () => {
          await message.commit();
        },
        onFailure: (err, delayMs) => {
          opts.metrics?.inc("kafka_consume_failures");
          opts.logger?.warn(
            {
              topic: message.topic,
              partition: message.partition,
              offset: message.offset.toString(),
              delayMs,
              err: String(err),
            },
            "kafka consume failed; retrying",
          );
        },
      });
      if (outcome === "aborted") break;
    }
  } finally {
    opts.signal.removeEventListener("abort", stop);
    await consumer.close();
  }
}
