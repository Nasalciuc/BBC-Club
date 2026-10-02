import type { Handler } from "../events/registry";
import type { KafkaProducer } from "./producer";

export const RELAY_CONSUMER = "platform.kafkaRelay";
export const DOMAIN_TOPIC = "bbc.domain-events.v1";

/** Outbox consumer. At-least-once. No per-aggregate order — consumers are idempotent. */
export function kafkaRelayHandler(producer: KafkaProducer): Handler {
  return async (ctx, payload) => {
    await producer.send({
      messages: [
        {
          topic: DOMAIN_TOPIC,
          key: Buffer.from(ctx.event.aggregateId),
          value: Buffer.from(
            JSON.stringify({
              id: ctx.event.id,
              type: ctx.event.type,
              version: ctx.event.version,
              aggregateType: ctx.event.aggregateType,
              aggregateId: ctx.event.aggregateId,
              occurredAt: ctx.event.occurredAt.toISOString(),
              payload,
            }),
          ),
          headers: {
            id: Buffer.from(ctx.event.id),
            type: Buffer.from(ctx.event.type),
            version: Buffer.from(String(ctx.event.version)),
          },
        },
      ],
    });
  };
}
