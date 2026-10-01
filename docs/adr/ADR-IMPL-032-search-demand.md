# ADR-IMPL-032 — Search demand, off until the flag is on

Status: accepted · Date: 2026-10-01 · Adds `ops:read` to the `system` role so `GET /v1/internal/demand` is callable with the internal secret.

**Context.** Advisors want routes that were searched and had no fare. The search request must not wait on Kafka, and the event must not carry a member id, an IP, or a device id.

**Decision.** `GET /v1/search` pushes a strict event onto a process buffer (max 10 000, drop oldest) only when `catalog.search_events` is enabled. A flusher started with the process publishes `bbc.search.v1`. The worker (`APP_ROLE` not `api`) consumes it once, counted in `platform.kafka_processed`, and updates Redis Top-K and Count-Min Sketches for that UTC day. Job `demand-rollup` (03:15 UTC) writes yesterday into `catalog.demand_daily`. `GET /v1/internal/demand?days=7` reads that table, routes with no fare first. Both flags default off / `pg` via `scripts/seed-flags.ts`. `system` gains `ops:read`.

**Consequence.** With the flags at their defaults, search and push behave as they do today. Demand numbers are approximate (sketches) and contain no identity.
