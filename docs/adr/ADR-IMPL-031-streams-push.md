# ADR-IMPL-031 — Push dispatch can move onto Redis Streams

Status: accepted · Date: 2026-10-01 · Amends nothing in the claim SQL. Adds a transport flag in front of the send.

**Context.** `dispatch` claims up to 100 pending rows and sends them in the same process. A slow provider holds the job. Redis Streams can hand the claimed ids to a worker without a second queue product.

**Decision.** Flag `jobs.push.transport` defaults to `pg`. Variant `streams` enqueues the claimed ids (`jobs:push:{0..7}`, group `push`, `MAXLEN ~ 100000`) and a worker that starts whenever `REDIS_URL` is set and `APP_ROLE` is not `api` calls the same `recordOutcome` path. The row status is the duplicate guard. If the enqueue throws, dispatch sends inline. Flipping the flag back to `pg` stops enqueueing; the worker still finishes ids already in the stream. Redis down keeps the `pg` path.

**Consequence.** No new notification state. Operators turn the flag on only after Redis is up. Auth sessions and auth rate limits stay in Postgres.
