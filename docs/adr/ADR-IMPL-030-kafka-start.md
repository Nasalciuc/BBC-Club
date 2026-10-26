# ADR-IMPL-030 — One Kafka broker, fed by the existing outbox

Status: accepted · Date: 2026-10-01 · Authorizes the relay inside `packages/modules/platform` and the optional `KAFKA_BROKERS` env. Does not add a catalogue event.

**Context.** `platform.domain_events` is the outbox: one row per fact, one `event_deliveries` row per consumer, polled with retries and a DLQ. Search demand and other readers should not add a delivery row, or a poller handler, for every fact. A log they can read at their own pace is the next step. More than one broker is not justified on one box.

**Decision.**

1. One Kafka broker in KRaft combined mode, on network `data`, no published port. Topics are created by an idempotent init container, not by the broker (`auto.create.topics.enable=false`).
2. The client is `@platformatic/kafka`. The producer is idempotent with `acks: -1` (the protocol value for "all"; this client rejects the string `all`).
3. The relay is a poller consumer named `platform.kafkaRelay`, registered for every catalogue type **only when `KAFKA_BROKERS` is set**. Unset, it is not registered, so `noConsumer` events gain no delivery row. It publishes to `bbc.domain-events.v1` with key `aggregateId` and headers `id`, `type`, `version`. It inherits the poller's retries and DLQ.
4. Delivery is **at-least-once**. There is **no ordering guarantee**: a failed relay delivery waits in backoff while a later event for the same aggregate can be published. Consumers are idempotent and order-independent. Ordered delivery is a later Debezium step, not this broker.
5. `platform.kafka_processed` records `(consumer, event_id)` with `event_id text`. The journal id is a bigint, not a uuid; search messages use `topic:partition:offset`. The effect and the insert run in one Postgres transaction. The Kafka offset is committed only after that transaction commits.
6. If a graph or dependency gate flags the relay, the exception cites this ADR. The relay does not import `apps/api`.

**Consequence.** With `KAFKA_BROKERS` unset the poller is unchanged. With it set, a dead broker retries the delivery; nothing is dropped, and nothing is promised in aggregate order.
