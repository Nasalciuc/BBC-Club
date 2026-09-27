# ADR-IMPL-022 — Rate limiting is a platform capability

Status: accepted · Date: 2026-09-27 · Amends nothing. `packages/shared` is ADR-gated (`ModulePlatform`).

**Context.** Submit used a clock-hour counter: five requests at 10:58 and five at 11:01 were ten in three minutes, and three colleagues behind one NAT filled the IP bucket. Read routes had no limit. A write to Postgres on every home refresh is not worth it.

**Decision.**

1. GCRA. Security and write rules live in Postgres (`platform.rate_limit_state`) and fail closed. Read rules live in process memory and fail open. A denied request is `429` with `Retry-After`.
2. Defaults live in code. A `platform.flags` row `ratelimit.<rule>` may override `limit`, `periodMs`, and `burst` from the cache — not a query per request, and not a deploy.
3. `ModulePlatform` exposes `rateLimit.check(rule, subject)`. Better Auth keeps its own limiter.

**Consequence.** Colleagues on one network can each request a fare. A store outage on a closed rule is `503`, never "allowed".
