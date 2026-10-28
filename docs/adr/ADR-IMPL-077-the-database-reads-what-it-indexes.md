# ADR-IMPL-077 — The database reads what it indexes: plans checked on volume, retention in batches, Grafana on Postgres

Status: proposed · Date: 2026-10-26 · Scope: `packages/modules/platform` (`jobs/index.ts`: `lastRuns`,
`lastFinishedRuns`; `jobs/builtin.ts`: `retention`; `events/publish.ts`), `packages/shared` (`time-zone.ts`:
`zoneDayBounds`), `packages/db` (`helpers.ts`: `deleteInBatches`; `scripts/verify.ts`: rules 3, 13 and 14;
`scripts/migrate.ts`; the hot-query test), migrations `0048_identity_auth_lookups.sql`,
`0049_catalog_demand_from_route.sql`, `0050_platform_autovacuum.sql`, `0051_notifications_autovacuum.sql`,
`0052_platform_monitor_role.sql`, `0053_platform_monitor_role_limits.sql`, the catalog
(`fares.repo.ts`: a dated search; `discovery.repo.ts`; `retention-demand`), identity (`retention-auth`), notifications
(`dispatch.ts`; `retention-notifications`), members (`deliverabilityOf`), `infra` (Postgres's settings in
`docker-compose.yml` and `compose.staging.yml`; Grafana's Postgres datasource and the database dashboard; `deploy.sh`,
`bootstrap.sh`, `env/production.env.example`; `RUNBOOK.md`), the `monitoring` job in `validate.yml` · Builds on
ADR-IMPL-073 (the monitoring) and ADR-IMPL-074 (named statements).

**Context.** Read against Markus Winand's _SQL Performance Explained_ (the PR-DB debates of 26 October, E1–E10 on
Postgres 16), the data layer had reads that grow worse with time:

- `/status` found each job's last run with `DISTINCT ON (job) … ORDER BY job, started_at DESC` against an index in the
  other direction, on `job_runs`, which nothing deletes: a year of runs sorted 134 MB on disk, 5.2 s (E10).
- `publish` read the event it had just written back from the journal by id alone, without the partition key: every
  monthly partition was probed (22 buffers against 3, E9), at every event.
- "Popular from" read one origin's last days against a primary key that starts with the day: it walked every route of
  every day in the window. Better Auth reads `auth.rate_limit` by key at every `/api/auth/*` request, and nothing
  indexed the key; a code's check reads `auth.verification` by address; members' reconcile sorts `auth.user` by
  creation every 15 minutes.
- A dated search compared `(depart_at AT TIME ZONE <the origin's zone, a subquery per row>)::date` with the day: a
  function on the column, so no index could bound it.
- Ten tables grew without end; the one retention delete was a single statement.
- The dispatch read each claimed row's member status and preferences, then its devices — up to 300 statements a claim.
- Postgres ran with JIT, a 1 s slow-statement log and nothing that logged a plan; staging planned with other settings.
- `db:verify`'s rule 3 asked for an index on every `*_id` column, read or not.

**Decision.**

1. **Plans checked on volume.** The hot-query test seeds a year of job runs, a month of demand for 8 000 routes a day
   and 50 000 rate-limit rows, and checks the shape of each new read's plan — the index named, no sequential scan, no
   sort where the index holds the order — and the fares' reads on the generic plan (ADR-IMPL-074). It runs with every
   database suite (no separate CI job: the seed takes seconds).
2. **`lastRuns` / `lastFinishedRuns`**: one probe per registered job, `LATERAL … ORDER BY started_at DESC LIMIT 1` on
   `job_runs_job_started` (`lastRunsSql`).
3. **`publish`** writes the deliveries with the event's key as the insert returned it — `occurred_at` as text, to the
   microsecond — and reads nothing back.
4. **Indexes**, each built `CONCURRENTLY` by migrate.ts: `auth.rate_limit (key)`, `auth.verification (identifier)` and
   `auth."user" (created_at)` — plain, never unique (Better Auth may write two rows for a key at one moment), in SQL only
   (`schema/auth.ts` is Better Auth's generated file); `catalog.demand_daily (route_from, day)` — 2.6× fewer buffers at
   8 000 routes a day, chosen by the planner from there up (measured). The airports' `(popularity DESC, code)` came with
   ADR-IMPL-075.
5. **A dated search** with the origin's zone at hand (the route reads the airports from memory) compares `depart_at`
   with the day's two instants, `zoneDayBounds` — the same day Postgres reads, across a clock change and a midnight that
   does not exist (tested against Postgres for ten zones).
6. **Retention, in batches of 5 000** (`deleteInBatches`: each batch its own statement, picked by `ctid`), each module
   for its own tables, daily, idempotent; business records (requests and their events, offers, fares) are never
   deleted here:

   | table                                                               | kept                                                                                           | job                       |
   | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
   | `platform.job_runs`                                                 | 30 days; each job's last run and its last finished (succeeded or failed) run stay, however old | `retention`               |
   | `platform.event_deliveries` (done)                                  | 30 days                                                                                        | `retention`               |
   | `platform.event_dlq`                                                | 90 days                                                                                        | `retention`               |
   | `platform.kafka_processed`                                          | 14 days (twice Kafka's default retention)                                                      | `retention`               |
   | `platform.rate_limits`, `rate_limit_state`                          | as before                                                                                      | `retention`               |
   | `auth.session`                                                      | 7 days after it expired                                                                        | `retention-auth`          |
   | `auth.verification`                                                 | 1 day after it expired                                                                         | `retention-auth`          |
   | `auth.rate_limit`                                                   | 2 hours without a request (the longest window is 1 hour)                                       | `retention-auth`          |
   | `auth.otp_cooldown`                                                 | 1 day (moved from platform's job to identity's)                                                | `retention-auth`          |
   | `notifications.notifications` (sent, delivered, failed, suppressed) | 90 days; pending and sending never                                                             | `retention-notifications` |
   | `notifications.campaigns` (done)                                    | 180 days                                                                                       | `retention-notifications` |
   | `catalog.demand_daily`                                              | 400 days                                                                                       | `retention-demand`        |

   The journal's partitions are made three months ahead (`partitions`) and dropped after 24 months (`retention`), each
   in a transaction that waits 3 s at most for the journal's lock, else the next day (X8), and runs in UTC: the SQL
   functions cut months in the session's time zone, and a session elsewhere left hours between two months (X7).

7. **Autovacuum on the tables that change most** — `event_deliveries`, `job_runs`, `rate_limit_state`,
   `notifications.notifications`: after a fiftieth of the rows (vacuum, vacuum after inserts, analyze), checked by
   `db:verify`'s rule 13. No `fillfactor`: their updates change an indexed column (`status`), which no free space makes
   HOT (E4); the database dashboard shows the HOT share before any is set.
8. **`db:verify`'s rule 3** keeps asking for an index on every reference column but those listed in `NO_INDEX_NEEDED`,
   each with why nothing reads by it. The ten listed still have their index: they are the candidates to drop, with
   `fares_search`, `fares_destinations`, `deliveries_dead`, `deliveries_paused`, `airports_terms_norm_trgm`,
   `airports_city`, `profile_crm_client`, `profile_home_airport` and `requests_open` — dropped (`DROP INDEX
CONCURRENTLY`) in a small PR of their own once production's `idx_scan` has stayed at 0 for two weeks of real members
   (⚑E). An entry naming no column fails.
9. **The dispatch** reads a claim's members (`members.deliverabilityOf`: status and offer preferences, two statements
   for any number) and their devices in one read each — 3 statements a claim before its writes, for up to 300. Each
   list is one bound array (`anyText` in `@bbc/db/helpers`: `= ANY($1::text[])`), so a statement's text, and the plan
   Postgres keeps for it, does not change with the list's length (`IN ($1, …, $n)` was a statement per length); the
   jobs `/status` asks about likewise (`unnest($1::text[])`).
10. **Postgres's settings**, production and staging alike for planning: `jit=off`, `track_io_timing=on`,
    `log_min_duration_statement=250`, `auto_explain` loaded (never `log_analyze`), and no bound value in the log
    (`log_parameter_max_length=0`, `auto_explain.log_parameter_max_length=0`, and `log_error_verbosity=terse`, which
    leaves out an error's DETAIL — `Key (email)=(…)`); staging takes production's `effective_cache_size`, `work_mem`
    and `track_planning`, none of its memory. One difference: staging logs the estimated plan of a statement over
    500 ms, production keeps `auto_explain` off and never switches it on — a custom plan can carry a statement's bound
    values as text. A tuning on production reads `EXPLAIN (GENERIC_PLAN)` of `pg_stat_statements`' text (its `$n`, no
    value, nothing run); `EXPLAIN ANALYZE` only on staging, or at volume on a local database (`db:seed:volume`)
    (RUNBOOK § Tuning a statement). `db:verify` warns when a role or database setting turns `auto_explain.*` or
    `log_min_duration_statement` on for the app's role. `random_page_cost` stays 4 until the box's disk is confirmed
    an SSD (⚑F: `lsblk -d -o name,rota`, `0`).
    `scripts/env-profile.test.ts` checks that both say the same. Postgres takes these only when its container is made,
    which no deploy does: a deploy compares each running Postgres's command line with compose's (`stale_postgres`)
    and warns, to `OPS_WEBHOOK` too, then goes on (RUNBOOK § The first deploy after ADR-IMPL-077).
11. **Grafana reads Postgres** (⚑A): the role `bbc_monitor`, a member of `pg_monitor` (statistics, no table's rows), a
    login only once a production deploy or bootstrap with `MONITORING=on` gives it `GRAFANA_PG_PASSWORD`
    (`set_monitor_password`, `infra/env-value.sh`: through psql's stdin, the session's logging off); three connections at
    most, no statement past 10 s and every transaction read-only (0053; Grafana opens two); Grafana's PostgreSQL
    datasource (its plugin loaded again) and a third dashboard, `the database`: the slowest statements, the indexes
    never read, dead rows, HOT updates, sizes, temporary files.

**Not done, and why.** The feed's keyset with row values: the cursor stays `null` (⚑C), so no query reads past the
first page. The catalogue import and the account deletion's events, row by row: rare, measured for later.
`random_page_cost`: ⚑F. Dropping the indexes: ⚑E.

**Consequences.**

- `/status` and the dispatch stop growing with the tables; the tables themselves stop growing past their periods.
- A sign-in reads its rate-limit row by key instead of the table. "Popular from" reads its origin's days.
- A slow statement's plan is in Postgres's log; the slowest statements, idle indexes and vacuum's backlog are on a
  dashboard.
- Three new jobs on the cron (`infra/cron/crontab`, regenerated); the retention of `auth.otp_cooldown` moved from
  platform's job to identity's.
- Postgres takes `shared_preload_libraries`, `jit` and the log settings when recreated on purpose (ADR-IMPL-044);
  Grafana's memory now holds the PostgreSQL plugin's process too (the memory alert watches it).
