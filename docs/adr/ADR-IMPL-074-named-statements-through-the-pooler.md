# ADR-IMPL-074 — Named statements through PgBouncer; hot statements built once; constants where an index needs them

Status: proposed · Date: 2026-10-26 · Scope: `packages/db` (`client.ts`, `named-statements.ts`, `statements.ts`, `helpers.ts`: `eqConst`,
`inConst`), `packages/shared` (`DB_PREPARE`), the api host, the repositories of members, proposals, requests,
notifications and catalog, `infra` (`MAX_PREPARED_STATEMENTS` in the three Compose files) · Amends ADR-IMPL-026
(Decision 2: `prepare: false` through the pooler).

**Context.**

- No statement was prepared. Drizzle 1.0.0-rc.4 asks postgres.js for an unnamed statement unless a query was built with
  `.prepare()`, and `createDb` turned prepare off behind PgBouncer (ADR-IMPL-026). Each statement was parsed and planned
  on every call: `plans` equalled `calls` in `pg_stat_statements`, and planning (0.03–0.6 ms) cost more than execution
  (0.01–0.14 ms). Two round trips per statement (Parse/Describe/Flush, then Bind/Execute/Sync).
- ADR-IMPL-026 recorded that prepared statements "fail or hang" through transaction pooling. That holds on PgBouncer
  1.21–1.23, where `max_prepared_statements` defaults to 0. The image pinned since #45 is `edoburu/pgbouncer:v1.24.1-p0`,
  where it defaults to 200 and the entrypoint leaves it alone unless `MAX_PREPARED_STATEMENTS` is set.
- Drizzle built every statement's SQL and result mapper on every call: ~85 µs of a ~170 µs primary-key read.
- A partial index's predicate (`WHERE published = true`, `WHERE status = 'active'`) is matched only by a literal. With
  `eq(fares.published, true)` the value is `$1`: on a generic plan Postgres cannot prove the predicate and scans, so it
  keeps re-planning the statement at every execution instead (measured, E1 of the PR-DB debates).

**Decision.**

1. **Every statement is a named statement**, behind the pooler too: `createDb` wraps the postgres.js client
   (`namedStatements`) so Drizzle's unnamed request becomes a named one, in transactions and savepoints as well. A
   statement without parameters keeps the simple protocol, so a migration file still runs as one batch. PgBouncer keeps
   each one per server connection; `MAX_PREPARED_STATEMENTS=200` is written in production's, staging's and the test
   Compose files so a changed image cannot turn it off silently.
2. **`DB_PREPARE=on|off`** (default `on`) is the switch: `off` is ADR-IMPL-026's behaviour, back with an env change and a
   restart, no deploy of code.
3. **Hot statements are built once per executor** with `statement(name, build)` from `@bbc/db/statements`: values through
   `sql.placeholder(...)`, never in the SQL text, so the text and the plan stay one. On the process's `db` it is built
   once per process; on a transaction once per transaction, as building it in place would be. Today: the profile and
   its preferences (members), the feed's first page and the offer verdict (proposals), a fare by id (catalog), a
   member's requests and one request (requests), the inbox and its unread count (notifications).
4. **A constant an index names is written as a literal**: `eqConst(column, value)` and `inConst(column, values)` from
   `@bbc/db/helpers`, for a code's constant only (a state's name or a boolean; anything else throws). Used on the fares'
   `published`, the offers' `active`, the campaigns' `pending`/`running`, the notifications' `pending`/`sending`, the
   device tokens' `active`. The hot-query test checks the fares' reads on the generic plan (`EXPLAIN (GENERIC_PLAN)`).
5. `plan_cache_mode` stays `auto`: Postgres chose generic plans where they fit and kept custom plans for the airports'
   typeahead (`LIKE` with parameters), which is now answered from memory anyway (ADR-IMPL-075).

**Consequences.**

- Measured locally through PgBouncer 1.22 (`max_prepared_statements = 200`): the switch alone takes 10–45 % of a route's
  CPU off; with ADR-IMPL-075 and -076, Home's API CPU per request falls from 5.1 ms to 1.0 ms (`load/bench/perf.ts`, 2
  vCPU). The absolute numbers
  come from k6 on staging; `load/bench/perf.ts` checks statements and plans per request in CI.
- A migration that changes a table under a running replica: postgres.js retries once a statement whose plan went stale
  (`RevalidateCachedQuery`), outside a transaction. A `SELECT *` would still fail with "cached plan must not change
  result type" through PgBouncer, because the retry lands on the server's stale statement; Drizzle lists its columns, so
  an expand-only migration is safe (`pooler.test.ts`). Inside an open transaction the retry cannot happen and the
  request fails — on the old replicas, in the deploy window, as an `ALTER` already made it.
- Each server connection holds at most 200 statements (PgBouncer's LRU). With the pool at ~8 that is ≤ 1 600 plans;
  the hot set is ~50 texts. `pg_backend_memory_contexts` on staging is the check.
- `= ANY($1::bpchar[])` in place of `IN ($1, $2…)` was the plan for the airports' lists; they are answered from memory
  now (ADR-IMPL-075), so no hot `IN` list is left. A new one takes the array as one parameter, typed as the column.
- Tests run direct, named like production; `pooler.test.ts` runs through `pgbouncer-test`: 1 000 executions, an
  `ALTER TABLE ADD COLUMN` between them, and plans that stop growing.
