# ADR-IMPL-071 — A request's quota never waits on the pool; its refusals say why

Status: proposed · Date: 2026-10-26 · Scope: `packages/modules/platform/src/ratelimit` (`rule()`, `check` with a
resolved rule), `packages/shared/src/module-contract.ts` (`ModulePlatform.rateLimit`) · Amends ADR-IMPL-059 point 3
(the quota counted inside the caller's transaction).

**Context.**

- **The quota could stall the API (4.1.2).** `POST /v1/requests` counts its quota inside its transaction, on that
  transaction's connection (ADR-IMPL-059 point 3), under its idempotency lock. But `rateLimit.check` first resolved
  the rule — its defaults, or the flag row `ratelimit.<rule>` — and read that flag on a second pooled connection, with
  no timeout. The flag is cached for 30 s (5 s behind Redis), so this happened only on a cold cache: after a start, and
  again every 30 s. With as many submits at once as the pool has connections, each held one connection and waited for
  another, and none was ever freed: no statement was running, so neither `statement_timeout` nor Postgres' deadlock
  detector could end it. Reproduced on a pool of two: two submits at once never answered.
- **The rate rows themselves.** The October review suspected a deadlock on the GCRA rows. Every submit locks its
  address's row, then its member's, in that order, so concurrent submits from one member on one address queue on the
  first row and never cross. Reproduced with six such submits on a pool of two: with the rule cache warm they answered
  in about 0.1 s (five taken, the sixth refused by the member's limit, `pg_stat_database.deadlocks` 0); with it cold they
  stalled, as above. Same cause, no second one.

**Decision.**

1. **A rule is resolved before the transaction.** The limiter gains `rule(name)`, the rule as it applies now (defaults
   overridden by the cached flag row), and `check` takes either a name (resolved first, as before) or a rule `rule()`
   resolved. With `exec` — the caller's transaction — only a resolved rule is accepted: the types refuse a name, and so
   does the code at run time. `POST /v1/requests` resolves its two rules after the committed-replay check and before
   `withTx`, so a replay already answered still reads nothing, and nothing inside the transaction waits for a second
   connection on account of the quota. `ModulePlatform.rateLimit` (`packages/shared`) declares the same two methods.
   The other callers (the `rateLimit` middleware, the operator links) pass a name, outside any transaction.

**Consequences.**

- At pool-size concurrency on a cold cache, submits answer; each waits only for a free connection to read its rule,
  holding none.
- A flag changed by an operator still applies within the cache's 30 s; a rule resolved just before the transaction is
  at most that transaction's age older.
- Still inside the transaction, as ADR-IMPL-059 accepted: the fare, the offer and the estimate a request names are read
  on pooled connections, each bounded by its own 1 s timeout (`askWithin`) and never fatal. With the pool saturated, a
  request waits at most that long for each and records less. Moving them before the transaction would cost a catalog
  read for every rate-limited request, which the module chose not to pay (`submit-boundaries.test.ts`).

**Tests.** `apps/api/test/requests-rate.test.ts` ("on a full pool": a pool of two, two submits at once on a cold cache;
six from one member on one address); `packages/modules/platform/tests/ratelimit-pg.test.ts` (a pool of one: a rule
resolved before the transaction is counted inside it with no flag read; a name with a transaction is refused).
