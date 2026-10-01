import { sql } from "drizzle-orm";
import { Consumer } from "@platformatic/kafka";
import type { Db } from "@bbc/db";

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
      await opts.db.transaction(async (tx) => {
        const inserted = (await tx.execute(sql`
          INSERT INTO ${sql.raw("platform.kafka_processed")} (${sql.raw("consumer")}, ${sql.raw("event_id")})
          VALUES (${opts.consumerName}, ${eventId})
          ON CONFLICT DO NOTHING
          RETURNING ${sql.raw("event_id")}
        `)) as unknown[];
        if (inserted.length === 0) return;
        await opts.handle(eventId, value, tx);
      });
      await message.commit();
    }
  } finally {
    opts.signal.removeEventListener("abort", stop);
    await consumer.close();
  }
}
