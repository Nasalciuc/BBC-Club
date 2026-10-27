import { sql } from "drizzle-orm";
import type { PublishInput } from "@bbc/shared/events";
import { domainEvents } from "../infrastructure/schema";
import type { EventRegistry } from "./registry";
import type { Executor } from "@bbc/db";

export type { PublishInput };
export type Publisher = ReturnType<typeof createPublisher>;

export function createPublisher(
  registry: EventRegistry,
  metrics?: { inc(name: string, labels?: Record<string, string>): void },
) {
  /** Writes the event AND one pending delivery per registered consumer, inside the caller's transaction.
   *  `tx` is the first parameter by design: publishing outside a transaction is not expressible. */
  async function publish(exec: unknown, input: PublishInput): Promise<{ eventId: string; deliveries: number }> {
    // The shared ModulePlatform contract types this `unknown` (modules hold a delivery tx or their own Executor).
    const tx = exec as Executor;
    const def = registry.definition(input.type);
    if (!def) throw new Error(`publish: unknown event type ${input.type}`);
    def.schema.parse(input.payload); // fail at the source, not in the poller

    const [evt] = await tx
      .insert(domainEvents)
      .values({
        type: input.type,
        version: def.version,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        memberId: input.memberId ?? null,
        payload: input.payload,
        publishedBy: input.publishedBy,
      })
      // occurred_at as Postgres writes it, to the microsecond: a JS Date keeps milliseconds and would break the poller's
      // JOIN on (event_id, event_occurred_at).
      .returning({ id: domainEvents.id, occurredAt: sql<string>`${domainEvents.occurredAt}::text` });
    if (!evt) throw new Error(`publish: the journal insert for ${input.type} returned no row`);

    const consumers = registry.consumersOf(input.type);
    if (consumers.length) {
      // The event's key from the insert above, not read back from the journal: a read by id alone, without the
      // partition key, probed every monthly partition (22 buffers against 3, ADR-IMPL-077).
      await tx.execute(sql`
        INSERT INTO platform.event_deliveries (event_id, event_occurred_at, consumer, aggregate_id)
        SELECT ${evt.id}::bigint, ${evt.occurredAt}::timestamptz, v.consumer, ${input.aggregateId}
        FROM (VALUES ${sql.join(
          consumers.map((c) => sql`(${c})`),
          sql`, `,
        )}) AS v(consumer)`);
    } else if (!def.noConsumer && !def.deprecated) {
      metrics?.inc("events_without_consumer", { type: input.type });
    }
    metrics?.inc("events_published", { type: input.type });
    return { eventId: String(evt.id), deliveries: consumers.length };
  }
  return { publish };
}
