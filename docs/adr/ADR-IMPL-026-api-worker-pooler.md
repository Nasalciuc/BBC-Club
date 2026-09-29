# ADR-IMPL-026 — One worker owns the poller and jobs; API processes serve members

Status: accepted · Date: 2026-09-28 · Touches `packages/shared` (`APP_ROLE`, `DB_POOLER`) and deploy topology.

**Context.** Jobs take a **session-level** advisory lock on a reserved connection (`packages/modules/platform/src/jobs/index.ts`). Under PgBouncer transaction pooling that lock is not safe: the next statement can land on another server connection. Two API replicas could run a singleton job at once. Prepared statements and `statement_timeout` as a startup parameter also fail or hang through transaction pooling (verified 28 Sep, PgBouncer ≥ 1.21, PostgreSQL 16).

**Decision.**

1. `APP_ROLE`: `all` (tests and local, today's process) · `api` (member HTTP only, no poller, no job HTTP) · `worker` (poller + `POST /v1/internal/run/:job`, no member routes). Registry still boots every module so the worker has consumers and jobs.
2. One worker process, **direct** `DATABASE_URL` to Postgres. API processes connect through PgBouncer (`DB_POOLER=transaction`): `prepare: false`, no `statement_timeout` startup parameter. Timeouts come from `ALTER ROLE bbc SET statement_timeout = '15s'`.
3. Cron calls the worker (`API_URL=http://worker:8001`). Migrations and seeds use the direct URL.

**Consequence.** Scale API replicas without doubling singleton jobs. A misconfigured pooler fails `/ready` (two parameterised probes, 2 s) so a rolling deploy does not switch traffic to a hanging client.
