# ADR-IMPL-029 — Redis is a performance tier; the record stays in Postgres

Status: accepted · Date: 2026-10-01 · Amends ADR-IMPL-022 for read-path limits. Authorizes edits to `packages/shared` (`ServerEnv`, `ModulePlatform`) and `packages/modules/platform`.

**Context.** Four API replicas each keep their own memory for destinations, flags and read-path rate limits. A catalog import is invisible on the other replicas until that process cache expires. A client can pass a read limit once per replica. Postgres remains the system of record and the only store on a security path (Better Auth sessions and auth rate limits, ADR-IMPL-022 write rules, kill switches).

**Decision.**

1. Redis 8 (`redis-app`, private network `data`, no published port) is a cache, a shared counter for read-path limits, and later a job transport. GlitchTip keeps its own `redis` service. The API does not use that one.
2. `REDIS_URL` is optional. Unset, every path is today's Postgres (or in-process) path. Set, each Redis call still has a Postgres fallback, or fails closed when the datum is a kill switch.
3. The client speaks RESP3 with client-side caching. `disableOfflineQueue` makes a disconnected command fail at once so the caller falls back instead of queueing.
4. A process-local breaker opens for 30 seconds after an error and serves the fallback without waiting on Redis.
5. Kill switches and consumer pauses are never cached. Auth rate limits and session storage stay in Postgres.
6. Redis is AGPLv3. We use it internally as a network service; we do not link it into the mobile app or ship it as a combined work.

**Consequence.** Merging this ADR and its code changes nothing that runs until an operator sets `REDIS_URL`. Read limits (`read`, `search`) may then move to Redis; account-protecting limits do not.
