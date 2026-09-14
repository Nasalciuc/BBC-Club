import { sql } from "drizzle-orm";
import { domainEvents } from "../infrastructure/schema";
import type { EventRegistry } from "./registry";

export type PublishInput = {
  type: string;
  aggregateType: string;
  aggregateId: string;
  memberId?: string | null;
  payload: Record<string, unknown>;
  publishedBy: string;
};
export type Publisher = ReturnType<typeof createPublisher>;

export function createPublisher(
  registry: EventRegistry,
  metrics?: { inc(name: string, labels?: Record<string, string>): void },
) {
  /** Writes the event AND one pending delivery per registered consumer, inside the caller's transaction.
   *  `tx` is the first parameter by design: publishing outside a transaction is not expressible. */
  async function publish(tx: any, input: PublishInput): Promise<{ eventId: string; deliveries: number }> {
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
      .returning({ id: domainEvents.id });

    const consumers = registry.consumersOf(input.type);
    if (consumers.length) {
      // Copy occurred_at in SQL — JS Date only has ms precision and would break the poller JOIN.
      await tx.execute(sql`
        INSERT INTO platform.event_deliveries (event_id, event_occurred_at, consumer, aggregate_id)
        SELECT e.id, e.occurred_at, v.consumer, ${input.aggregateId}
        FROM platform.domain_events e
        CROSS JOIN (VALUES ${sql.join(
          consumers.map((c) => sql`(${c})`),
          sql`, `,
        )}) AS v(consumer)
        WHERE e.id = ${evt.id}`);
    } else if (!def.noConsumer) {
      metrics?.inc("events_without_consumer", { type: input.type });
    }
    metrics?.inc("events_published", { type: input.type });
    return { eventId: String(evt.id), deliveries: consumers.length };
  }
  return { publish };
}
