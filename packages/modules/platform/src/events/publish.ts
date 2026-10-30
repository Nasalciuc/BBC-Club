import { sql } from "drizzle-orm";
import type { PublishInput } from "@bbc/shared/events";
import { col } from "@bbc/db/helpers";
import { domainEvents, eventDeliveries } from "../infrastructure/schema";
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

    const consumers = registry.consumersOf(input.type);
    let eventId: string;
    if (consumers.length) {
      // The event and its deliveries in one statement: the deliveries take the event's key, (id, occurred_at), as the
      // insert returns it inside Postgres — never read back from the journal (a read by id alone, without the partition
      // key, probed every monthly partition: 22 buffers against 3, ADR-IMPL-077) and never through text, which the
      // session's DateStyle and TimeZone would write (in `SQL, DMY` and Asia/Kolkata, `IST`, which Postgres reads as
      // Israel's: the delivery pointed at no event).
      const D = domainEvents;
      const E = eventDeliveries;
      const [row] = (await tx.execute(sql`
        WITH e AS (
          INSERT INTO ${D} (${col(D.type)}, ${col(D.version)}, ${col(D.aggregateType)}, ${col(D.aggregateId)},
                            ${col(D.memberId)}, ${col(D.payload)}, ${col(D.publishedBy)})
          VALUES (${input.type}, ${def.version}, ${input.aggregateType}, ${input.aggregateId}, ${input.memberId ?? null},
                  ${JSON.stringify(input.payload)}::jsonb, ${input.publishedBy})
          RETURNING ${col(D.id)}, ${col(D.occurredAt)})
        INSERT INTO ${E} (${col(E.eventId)}, ${col(E.eventOccurredAt)}, ${col(E.consumer)}, ${col(E.aggregateId)})
        SELECT e.${col(D.id)}, e.${col(D.occurredAt)}, v.c, ${input.aggregateId}
        FROM e CROSS JOIN (VALUES ${sql.join(
          consumers.map((c) => sql`(${c})`),
          sql`, `,
        )}) AS v(c)
        RETURNING ${col(E.eventId)}`)) as unknown as Record<string, unknown>[];
      if (!row) throw new Error(`publish: the journal insert for ${input.type} returned no row`);
      eventId = String(row[E.eventId.name]);
    } else {
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
        .returning({ id: domainEvents.id });
      if (!evt) throw new Error(`publish: the journal insert for ${input.type} returned no row`);
      eventId = String(evt.id);
      if (!def.noConsumer && !def.deprecated) metrics?.inc("events_without_consumer", { type: input.type });
    }
    metrics?.inc("events_published", { type: input.type });
    return { eventId, deliveries: consumers.length };
  }
  return { publish };
}
