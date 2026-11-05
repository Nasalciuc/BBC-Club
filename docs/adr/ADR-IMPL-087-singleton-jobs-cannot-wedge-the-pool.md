# ADR-IMPL-087 — Singleton jobs cannot wedge the pool

Status: proposed · Date: 2026-11-05 · Scope: `packages/modules/platform` (`src/jobs/index.ts`, `MODULE.md`,
`tests/jobs-singleton.test.ts`) · Amends the singleton lock of the job runner (reserved connection, `jobs-singleton.test.ts`).

**Context.** On 5 Nov 2026 every job stopped: in production at 02:00 UTC, on staging at 04:00 UTC. For eight hours
nothing ran — `send-requests` among them, so the requests members sent stayed in the club and no agent saw them — until
the owner restarted both workers at 10:15. The workers stayed "healthy" (their check asks `/health`, which reads no
table), the database had no query running and no lock waiting, and the logs had no error: the runs had started (eight
`running` rows at 04:00 on staging) and never ended.

The cause is in the runner. A singleton job takes its advisory lock on a connection it reserves from the pool for the
whole run (`db.raw.reserve()`), then writes its `running` row and does its work through the pool. The worker's pool has
10 connections; busybox cron starts every job due in a minute in the same second. At 02:00 and 04:00 more singleton
jobs are due than on other minutes (`partitions`; `cleanup-devices`, `retention`, beside the every-minute and
every-15-minute ones). Ten runs each reserved a connection and each then waited for an eleventh to write its row: no
run could finish, so no connection came back, and every later run waited for a connection too — with no timeout, since
the job's own timeout only fires its `signal`, which a query waiting for the pool does not read. `jobs-singleton.test.ts`
reproduces it: ten singleton runs at once on a pool of ten never end.

**Decision.**

1. **Slots.** At most `singletonSlots(pool)` singleton runs at once in a process: 40 % of the pool, at least one — 4 of
   the worker's 10. A run waits up to 45 s for a slot (under the cron's minute); past it, it is recorded `skipped`, as a
   run behind the lock already is, and the next minute tries again. Each slot holds one reserved connection; the other
   six are left for the runs' work, the poller and the internal routes, so every run can always finish.
2. **A second run of the same job is skipped at once** (it would only wait for a slot behind itself and then find the
   lock held), as before.
3. **The timeout ends the run.** When a job's `timeoutMs` (10 min by default) passes, its `signal` fires as before; a
   handler that has not settled 30 s later is ended by the runner: the run is `failed` with
   `JobTimedOut: job <name>: still running …`, its lock is released and its slot freed. A handler that stops on its
   signal within the grace keeps its own outcome (retention's counts). What a handler still does after being ended is no
   longer the run's — its queries are bounded by the connection's `statement_timeout` (15 s).

**Consequences.** A minute with more singleton runs due than slots runs them four at a time; each of today's every-minute
jobs takes well under a second, so all finish in the minute. A long singleton (`sync-site-destinations`, five minutes)
holds one slot while it runs. Raising the worker's pool would only have moved the threshold; the slots remove the
deadlock whatever the number of jobs. Not changed here, and worth doing next: the worker's healthcheck could ask
`/ready` (a database round trip) instead of `/health`, and an alert on a job without a run for 15 minutes (today 36 h)
would have said within minutes what took eight hours to see.

**Tests.** `tests/jobs-singleton.test.ts`: ten singleton runs at once on a pool of ten all succeed (before: none ended);
a run that finds no slot in time is `skipped`, and the next one runs; a handler that ignores its timeout is ended with
`JobTimedOut`, and the next run of the job is not skipped; a handler that stops within the grace keeps its own outcome.
