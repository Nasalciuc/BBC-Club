# @bbc/db — the database layer, and the rules it enforces

**Versions:** drizzle-orm / drizzle-kit **`1.0.0-rc.4`** (pinned), postgres.js 3.x, PostgreSQL 16 on the VPS (uuid v4 from `gen_random_uuid()`; `uuidv7()` when we move to PG 18).

> **Debt — stable Drizzle 1.x:** `^1.0.0` is not a published stable range yet. We pin the RC that the assembled
> lockfile resolves. Moving to stable 1.x with Relational Queries v2 (`defineRelations`) remains an explicit
> follow-up; see [`DB_LAYER_DESIGN.md`](./DB_LAYER_DESIGN.md). Do not bump to `^1.0.0` until that note is closed.

## What lives here

- `src/client.ts` — one `createDb(url, opts)`; pool sizing (app 10, scripts 1), `statement_timeout` 15 s, `withTx` for composable use cases, `Executor` type so repositories accept a db **or** a transaction.
- `src/schema/*` — one file per Postgres schema = one owning module (`platform`, `auth`, `members`, `notifications`, `proposals`, `engagement`, `crm`, `personalization`). Explicit column names everywhere; no casing magic. (After stage 0 day 4 the files move next to their modules; this package keeps the index that re-exports them.)
- `src/relations/*` — Relational Queries v2 **parts per module**; a part may reference only its own schema's tables (`test/relations.test.ts` enforces it). Cross-module reads are facade calls or events, never relations.
- `src/helpers.ts` — `bumpCounter` (atomic upsert with optional cap), `tryAdvisoryXactLock`, `forUpdateSkipLocked`, keyset `cursor`, `assertNotProduction`.
- `migrations/` — drizzle-kit output, numbered `NNNN_<module>_<desc>`, plus `0001_extras.sql` (updated_at trigger, monthly partitioning of `platform.domain_events`, `platform.cross_schema_fks` view). `scripts/migrate.ts` applies both, under an advisory lock, `exit(1)` on failure.
- `scripts/verify.ts` — **fitness functions on the live DB**, run in CI after migrate: schemas exist · no cross-schema FK · every `*_id` column indexed · no naive timestamps · `created_at` everywhere · trigger on every `updated_at` · status columns are enums · journal is partitioned.
- `scripts/seed-fixture.ts` — the canonical fixture, idempotent, refuses production. `scripts/reset-test.ts` — truncate, test databases only (double guard).
- `test/schema.test.ts` — proves Postgres refuses bad data with zero application code (CHECKs, XOR, idempotency key, enum via raw SQL, atomic counters under 25 concurrent increments).

## Rules (from the two guides + our own scars)

1. PK is a synthetic uuid; **business logic is never a PK**; the auth provider's id is never a key anywhere.
2. `created_at` on every table; `updated_at` only where rows change, always with the DB trigger; immutable tables (journal, inbox, runs) have none.
3. Every reference column has an index; every hot query has a dedicated (often partial) index named `<table>_<purpose>`.
4. Invariants in the database: `pgEnum` for states, CHECK for ranges and XOR consistency, UNIQUE (scoped to the parent) for idempotency, NOT NULL explicit.
5. Junction tables use composite PKs; 1:1 uses `.unique()` on the FK.
6. `timestamptz` only; `numeric(10,2)` for money as strings in TS; `char(3)` for IATA/currency.
7. FKs with `onDelete` chosen consciously — **inside a module only**; across modules: opaque ids + events + idempotent handlers + the "zero rows" deletion test.
8. Every transient row has an expiry (`expires_at`, `last_seen_at`, `deleted_at` + purge, partitions + retention).
9. Repositories take an `Executor`; use cases open the transaction; `events.publish(tx, …)` rides inside it.
10. Raw `sql` only in `infrastructure/` for what Drizzle cannot express (SKIP LOCKED, advisory locks, partition DDL). Never `forEach(async)`; every script exits 1 on error; seeds and resets are guarded.

## Commands

`bun run db:generate` → review the SQL → `bun run db:migrate` → `bun run db:verify` (CI fails on any finding) · `bun run db:seed` (dev/staging) · `docker compose -f infra/compose.test.yml up -d && bun run db:reset:test && bun test`.

## Verified against installed versions

Pinned: **drizzle-orm 1.0.0-rc.4**, **drizzle-kit 1.0.0-rc.4**, **postgres.js 3.4.9**.

| #   | Assumption                                                                                                        | Result                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 7   | `drizzle(client, { schema, relations })`                                                                          | Accepted by this RC (`src/client.ts`); typings disagree → `@ts-nocheck` debt, not dead runtime |
| 8   | `defineRelations` / `r.many.offerTargets({ from, to })` + `db.query.offers.findMany({ with: { targets: true } })` | Compiles; runtime nested rows in `test/relations-runtime.test.ts`                              |
| 9   | `onConflictDoUpdate({ setWhere })`                                                                                | Accepted; `bumpCounter` + `responses.repo.upsert` tests                                        |
| 12  | `postgres(url, { connection: { statement_timeout }, transform: { undefined: null } })`                            | `current_setting('statement_timeout')` → `15s` (`relations-runtime.test.ts`)                   |
