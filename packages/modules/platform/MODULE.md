# platform

**Owns:** schema `platform.*` — `domain_events` (partitioned monthly), `event_deliveries`, `event_dlq`, `external_inbox`, `flags`, `job_runs`, `rate_limits`.
**Publishes:** nothing. **Consumes:** nothing. It is the mechanism other modules publish and consume _through_.
**Facade (`src/api/index.ts`):** `events.{defineEvent, registerConsumer, publish, tombstoneMember}` · `flags` · `jobs` · `poller` (host only) · `logger` · `metrics` · `health()`.
**Guarantees:** event + deliveries written in the caller's transaction (atomic with the state change) · at-least-once delivery · handler writes and delivery status commit together · order per `aggregate_id`, never global · 6 retries with exponential backoff then DLQ · consumer pause without deploy.
**Does not guarantee:** global ordering · exactly-once for external side effects (handlers must be idempotent) · delivery while a consumer is paused.
**Jobs owned:** `partitions`, `retention`, `queue-health`.
**Invariants tested:** rollback → no event · one delivery per consumer · single delivery under two pollers · handler rollback + backoff · DLQ after 7 attempts · replay · per-aggregate order · upcast · pause/resume · tombstone · job singleton/record/failure · flags fail-safe · metrics render.
**Alerts:** oldest pending delivery > 5 min (transactional path) · any DLQ row · job without a successful run in 36 h.
