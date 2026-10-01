# platform

**Owns:** schema `platform.*` — `domain_events` (partitioned monthly), `event_deliveries`, `event_dlq`, `external_inbox`, `flags`, `job_runs`, `rate_limits`.
**Publishes:** nothing. **Consumes:** nothing. It is the mechanism other modules publish and consume _through_.
**Facade (`src/api/index.ts`):** `events.{defineEvent, registerConsumer, publish, tombstoneMember}` · `flags` · `jobs` · `poller` (host only) · `logger` · `metrics` · `cache` · `search` · `streams` · `kafka` · `redis` · `health()` · `close()`.
**Guarantees:** event + deliveries written in the caller's transaction (atomic with the state change) · at-least-once delivery · handler writes and delivery status commit together · 6 retries with exponential backoff then DLQ · consumer pause without deploy. The Kafka relay `platform.kafkaRelay` is registered only when `KAFKA_BROKERS` is set. It is at-least-once and does not keep per-aggregate order; consumers are idempotent and order-independent. Ordered delivery is the later Debezium step (ADR-030).
**Does not guarantee:** global ordering · exactly-once for external side effects (handlers must be idempotent) · delivery while a consumer is paused · Redis or Kafka being up. Both are optional. Unset `REDIS_URL` and `KAFKA_BROKERS` leave every path on Postgres.
**Handler timeout:** the poller stops _waiting_ when `handlerTimeoutMs` elapses and rejects the delivery race; the handler must check `ctx.signal.aborted` before each expensive step to stop _working_ on the rolled-back transaction.
**Jobs owned:** `partitions`, `retention`, `queue-health`, `db-observe` (gauges + `OPS_WEBHOOK` thresholds), `db-report` (weekly; also `GET /v1/internal/db-report`).
**Invariants tested:** rollback → no event · one delivery per consumer · single delivery under two pollers · handler rollback + backoff · DLQ after 7 attempts · replay · per-aggregate order · upcast · pause/resume · abortable timeout · tombstone · job singleton/record/failure · flags fail-safe · metrics render.
**Alerts:** oldest pending delivery > 5 min (transactional path) · any DLQ row · job without a successful run in 36 h.

## Verified against installed versions

Pinned: **drizzle-orm / drizzle-kit 1.0.0-rc.4**, **postgres.js 3.4.x**, **pino 9.x** (logger).

| #                       | Assumption                                                                                   | Result                             |
| ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| Handler `AbortSignal`   | poller aborts waiting and handlers can stop                                                  | `journal.test.ts` timeout + signal |
| Singleton advisory lock | reserved connection via `db.raw.reserve()`                                                   | `jobs-singleton.test.ts`           |
| Jobs / flags / metrics  | createPlatform surface                                                                       | existing platform tests            |
| Redis client            | `redis@6.3.0` (node-redis 6). `RESP: 3`, client-side cache, `disableOfflineQueue`, `close()` | `breaker.test.ts` (no network)     |
| Kafka producer acks     | `@platformatic/kafka@2.12.1` allows `0 \| 1 \| -1`. `-1` is all replicas.                    | producer options schema            |
| Top-K / CMS             | `client.topK` and `client.cms` on the same package                                           | used by catalog demand             |

Read and search rate limits use Redis GCRA when `REDIS_URL` is set and fall back to the in-process store on error. Postgres rules are unchanged. Kill switches and consumer pause read Postgres and are not cached.
