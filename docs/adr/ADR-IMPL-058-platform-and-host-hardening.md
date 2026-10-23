# ADR-IMPL-058 — Platform and host: a boot that waits for its database, strict flag reads, errors without parameters

Status: accepted · Date: 2026-10-22 · Scope: P1 (`packages/modules/platform`: flags, jobs, the events poller and every
platform log line; `@bbc/db` `errorForLog`/`errorLine`; the api host: boot, the api and worker entries, `/status`,
`/v1/app-config`, the body limits, the error contract; `AGENTS.md` rule 6; `infra/RUNBOOK.md`) · Amends ADR-IMPL-013
point 7 (kill flag read errors) for boot only; keeps the rest of it.

**Context.** A walk of every API route on two harness stacks (October 2026) and two known defects found, on the
platform and the host:

- An api or worker started while Postgres/pgbouncer were not up yet (a host reboot: restart policies ignore
  `depends_on`) read every kill flag once at boot; a read error fails closed (ADR-IMPL-013 point 7), so all twelve
  modules were "killed" for the life of the process. `/health`, `/ready` and `/status` answered 200 while every `/v1`
  member route answered 404, and the worker registered none of the modules' consumers or jobs, until someone restarted
  them.
- `/v1/app-config` meant to serve its last good answer with the database down, but `flags.variant()` and
  `killSwitches()` swallow their errors: it took 16–19 s and answered minimum version 0.1.0 with every module
  killed.
- The 256 KB limit on `/v1/*` also matched `/v1/internal/*`, after its 1 MB limit, so a catalogue import over about
  3,000 fare rows was refused; and Hono's 413 `HTTPException` has no `body.code`, so every oversized body answered
  500 INTERNAL, was logged as `unhandled` and counted as a 5xx.
- A failed query's message (Drizzle's `DrizzleQueryError`: the SQL and `params: …`) and postgres.js's own fields hold
  its parameters — session tokens, emails. The error contract, `/v1/app-config`, `job_runs.error`, a delivery's
  `last_error`, the DLQ and the platform's log lines carried them.
- `/status` checked only that scheduled jobs ran: campaign-fanout failing every minute (`bbc_job_failed` 5) left it
  green.
- The forced-update page has no store address to open (the server's half is here); the seed rolled a 29 February
  validity into 1 March.

**Decision.**

1. **Boot waits for its database; only a flag the database answered with kills a module.** `registry.boot` first runs
   `SELECT 1`, then reads every module's kill flag with `flags.killState(module)`, each with retries after 0.5, 1, 2, 4
   and 8 s (about 16 s), before any module starts. Still unreadable: boot rejects with `DatabaseUnreachable` and mounts
   nothing; `buildApp` logs `boot: database unreachable, exiting` (fatal) and both process entries (`src/index.ts`,
   `src/worker.ts`) exit 1, so Docker's `unless-stopped` starts them again. A module killed by a flag the database
   answered with keeps ADR-IMPL-013's meaning: facade only, routes, consumers and jobs not registered (HTTP 404,
   `test/boot.test.ts`). Per request, `isKilled` keeps failing closed.
2. **Strict flag reads.** `flags.killState(module)` is the kill flag without the fail-closed fallback: it throws when it
   cannot be read. `flags.readStrict(key)` is the flag row through the same local and Redis caches as `read`, and throws
   instead of falling back. `read` is `readStrict` plus its unchanged fallback.
3. **`/v1/app-config` serves the last answer it read in full.** It reads its five variants with `readStrict` and the six
   kill switches with `killState`, all under one 1.5 s budget. Any failure or timeout answers the last fully read answer
   of that process (the built-in values — 0.1.0, nothing killed, no maintenance — on a cold one) and logs the error with
   `errorForLog`; only a fully read answer replaces it. The answer may carry `storeUrl { ios?, android? }` from the
   variants `app.store_url_ios` and `app.store_url_android`: served only when it matches
   `^(https|itms-apps|market)://\S+$` after trimming, left out when unset or refused. `scripts/seed-flags.ts` seeds both
   empty for the owner to set once the listings exist. The app tolerates the new field (it reads only the keys it
   knows); its use is the app's half.
4. **`/status` turns red on a failing scheduled job.** `jobs.lastFinishedRuns()` is the last succeeded-or-failed run per
   job (a run still going or skipped behind the lock says nothing yet). `/status` reports `failingJobs` — the scheduled
   jobs whose last finished run failed — and is 503 while it is not empty. The next run that succeeds clears it. `/ready`
   is unchanged and stays the deploy gate.
5. **One body limit per request, answered in the API's shape.** `/v1/internal/*` takes 1 MB; the 256 KB member limit
   skips paths under `/v1/internal/`. Over the limit: 413 `{ error: { code: "VALIDATION", message: "This request is
too large.", requestId: … } }` (the `apiError` shape; no new error code; `packages/shared` untouched), counted in
   `http_errors` as a client error. The error contract maps
   any Hono `HTTPException` below 500 to its own status (401/403/429 as for Better Auth, anything else VALIDATION) with
   the code's own message, and never logs it as `unhandled`.
6. **An error reaches a log line or a stored text only through `errorForLog`/`errorLine` (`@bbc/db`).** A query error
   keeps its name, `Failed query`, the SQLSTATE and the table and constraint it names, and its stack frames; never its
   message, parameters or detail. Any other error keeps its name and message; a thrown non-Error keeps only its type. On
   the platform: `job_runs.error` and a run's result (`POST /v1/internal/run/:job`), a delivery's `last_error`, the DLQ's
   `last_error`, and the lines `job failed`, `delivery retry`, `delivery dead`, `events.record_failure`,
   `events.dead.notify_failed`, `poller tick failed`, the flag, rate limit, search buffer, Redis, Kafka, pgbouncer and
   close-hook warnings. `AGENTS.md` rule 6 says so.
7. **The seed keeps 29 February on the last day of February** in a year without one, and back on the 29th in a leap
   year (`packages/db/scripts/fixture-dates.ts`).

**Not in this ADR.** The modules' own log lines and stored errors (catalog, notifications, requests) are fixed beside
this one, with the same `errorForLog`. `/api/auth/*` (Better Auth) has no body limit of ours; Bun's server default
applies. The app's use of `storeUrl` is its own change.

**Consequences.**

- An api or worker that cannot reach its database at boot exits 1 after about 16 s instead of serving with every module
  unmounted. This relies on `restart: unless-stopped` (set for both in `infra/docker-compose.yml`). A database whose
  platform schema is missing (no migrations yet) now makes them exit too, with the SQLSTATE in the log.
- A scheduled job that fails keeps `/status` red until it next succeeds: a daily job that fails once is red for a day, a
  weekly one (db-report) for a week, unless it is run again by hand (`POST /v1/internal/run/<job>` on the worker). A job
  that fails permanently in one environment (for example missing configuration) keeps that environment red.
- Stored error text changes shape from `message` to `Name: message` (`Error: nope`; a query error
  `DrizzleQueryError: Failed query (23505 <table> <constraint>)`). Nothing parses it.
- A refused body is a 413 the app reads as VALIDATION, and no longer a 5xx in `http_errors`.
