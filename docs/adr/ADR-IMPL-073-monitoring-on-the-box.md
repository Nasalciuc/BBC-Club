# ADR-IMPL-073 — Monitoring on the box: metrics only, VictoriaMetrics and Grafana; MinIO and staging make the room

Status: proposed · Date: 2026-10-25 · Scope: `packages/modules/platform` (`telemetry`: the text on `/metrics`,
`setCounter`, `registerProcessMetrics`; the `queueGauges` option; `observe/db-health.ts`), the api host's `buildApp`,
`infra` (`docker-compose.yml`: the `monitoring` and `media` profiles, Postgres's `track_planning`;
`compose.staging.yml`'s limits; `monitoring/`; `bootstrap.sh`, `deploy.sh`, `env-value.sh`,
`env/production.env.example`; `RUNBOOK.md`), the `monitoring` job in `validate.yml` and the staging guard in
`api-deploy.yml` · Amends ADR-IMPL-044 (Memory: the sum, and what is off unless asked for; the staging guard, which now
covers `infra/monitoring` too).

**Context.** Nothing on the box keeps what it did over time:

- `/metrics` is read by hand, one process at a time (RUNBOOK § Daily shape). The worker posts two database thresholds to
  `OPS_WEBHOOK` and Uptime Kuma watches `/status`; that is all that alerts. Whether a deploy made a route slower, which
  container is near its memory limit, what a request costs in CPU, or whether the VPS steals CPU from its two shared
  cores cannot be answered after the fact.
- The performance work that comes next (statements prepared once, caches) is judged by CPU per request, statements per
  request and plans per statement. Measured locally, every statement is planned on every call (`plans` equals `calls` in
  `pg_stat_statements`), and most of a request's CPU is the API's own. None of these numbers is recorded on the box.
- The text on `/metrics` was not quite what a scraper reads without guessing: no `# TYPE` line, histograms without the
  `+Inf` bucket `histogram_quantile` needs, `_count{}` with empty braces, label values not escaped.
- Every API replica's `/metrics` read the event journal for the queue's three gauges, one query per scrape, for numbers
  only the worker's poller acts on.
- The memory limits add up to 6.9 of 8 GB (ADR-IMPL-044) and the monitoring needs about 0.75 GB. MinIO (256 MB) runs
  with nothing in it until R1b: `/media/*` answers 404 (ADR-IMPL-047) and no bucket exists (ADR-IMPL-010). Staging held
  2.7 GB: 512 MB per API replica and for its worker, 1 GB for its Postgres.

**Decision.**

1. **Metrics only, on the box.** Four containers in a Compose profile, on with `MONITORING=on` in `production.env`:
   VictoriaMetrics (`v1.154.0`, single node, 90 days in `vm_data`, scraping every 30 s), Grafana
   (`grafana/grafana:13.2.3`; `grafana-oss` is no longer published from 12.4), node-exporter (`v1.12.1`: CPU with steal,
   memory, filesystem, load, disks, pressure) and cAdvisor (`0.60.6`: each container's CPU, memory against its limit,
   throttling, network, OOM kills). VictoriaMetrics speaks the Prometheus query API, so Grafana reads it as a Prometheus
   datasource. Grafana 13 ships its data sources as plugins, each backend its own process inside the container's limit:
   it loads Prometheus's alone (`GF_PLUGINS_DISABLE_PLUGINS`). One stack serves both environments, as Caddy does:
   production's deploy keeps it current (step 8).
2. **What is scraped.** Each API replica is its own target (`dns_sd_configs`, an A record per replica), production's and
   staging's, and each worker, labelled `env`; the host; and of cAdvisor's families the eight the dashboards and alerts
   read, the rest dropped at the scrape (`metric_relabel_configs`). A label a target already carries (`job`) is renamed
   by the scraper: the jobs' own name is `exported_job`.
3. **The text on `/metrics`** is each family once, its `# TYPE` line first; every histogram ends with `+Inf`, equal to
   its count; `_count` and `_sum` carry no braces when unlabelled; label values escape `\`, `"` and line feeds. The
   deploy canary (`scripts/canary-compare.ts`) reads it unchanged: it skips comment lines and the `+Inf` bucket.
4. **New families.** Every process: `bbc_process_cpu_seconds_total` (a counter), `bbc_process_resident_memory_bytes`,
   `bbc_process_heap_used_bytes`, `bbc_process_start_time_seconds` and the event loop's delay since the previous scrape,
   `bbc_event_loop_delay_p50_seconds`, `_p99_seconds` and `_max_seconds` (`monitorEventLoopDelay`;
   `performance.eventLoopUtilization()` reads 0 on Bun 1.3). One sampler serves the process, never stopped: the event
   loop is the process's, and Bun keeps a single histogram anyway. The worker's `db-observe`: PgBouncer's pools
   (`bbc_pgbouncer_clients_active`, `_servers_active`, `_servers_idle`, `_max_wait_seconds`) and its totals from
   `SHOW STATS` (`bbc_pgbouncer_transactions_total`, `_queries_total`, `_wait_seconds_total`, `_client_parses_total`,
   `_server_parses_total`, `_binds_total`), and the database's `pg_stat_statements` totals (`bbc_db_statements_total`,
   `bbc_db_statement_plans_total`, `bbc_db_statement_exec_seconds_total`, `bbc_db_statement_plan_seconds_total`). A
   total another system keeps is set as read (`setCounter`) and rendered as a counter, so a rate over it reads a reset
   as a reset.
5. **The queue's gauges are the worker's.** `createPlatform({ queueGauges })`, true where the poller runs (the worker,
   or `all`): a scrape of an API replica serving members reads no table.
6. **Planning is counted.** Postgres runs with `pg_stat_statements.track_planning=on`, so plans per statement show on
   Grafana whether statements are prepared once. Postgres takes it when it is recreated on purpose (ADR-IMPL-044);
   until then the worker publishes no plan series (no data, rather than a 0 read as "nothing planned"). The statement
   totals read `pg_stat_statements(false)`, without the statements' text. When pg_stat_statements drops its least-run
   entries to make room, the sums fall a little; VictoriaMetrics' rate reads a fall under an eighth of the value as a
   partial reset and carries on from it, so a fall that small shows no spike (a larger one reads as a reset).
7. **Two dashboards and seven alerts, as files.** `the box` (CPU and memory by container against the limit, throttling,
   network, kills for memory, the host, Postgres connections, the oldest transaction, PgBouncer, targets) and `the app`
   (requests, p95 and p99 by route, errors, API CPU per request, event-loop delay, statements per request, plans per
   statement, Postgres time, PgBouncer parses and binds, cache hits, the queue, failed jobs, memory), with an `env`
   variable. The request panels leave out the probes — Compose's healthchecks, the scrapes, Uptime Kuma — and the cron's
   job runs; the integrations' internal routes (offers, request status, imports) stay in. The seven alerts: a container
   above 90 % of its memory limit for 5 minutes; CPU steal above 20 % for 10; no `dispatch` finished in 10 minutes while
   the worker answers; an API replica or the worker that answered in the last day not answering a scrape for 5 (a
   replica that hangs, or the worker gone: one that crashed restarts and leaves no target); more than 2 % of
   production's requests answering 5xx for 10, the probes and the cron's job runs left out; a production container
   killed for memory (at once); event deliveries paused for 10 (ADR-IMPL-080). Those on production look
   only at what production has run, so on a box that runs staging alone they stay quiet. The worker keeps its own two
   (RUNBOOK § Database health). Provisioned from `infra/monitoring/grafana`: the UI cannot change them.
8. **Closed by default.** Everything is on the internal `data` network; Grafana is also on `edge`, for the webhook, and
   is published on the box's loopback only (`127.0.0.1:3000`): an SSH tunnel reaches it. Its admin password is
   `GRAFANA_ADMIN_PASSWORD`; sign-up, anonymous access, update checks, the news feed and plugin installs are off. Its
   alerts go to `GRAFANA_ALERTS_WEBHOOK`, usually `OPS_WEBHOOK`'s URL under a name of its own: production's compose
   substitutes both Grafana keys, so `guard_staging` refuses them in `staging.env`, which may keep its own
   `OPS_WEBHOOK`. `bootstrap.sh` and `deploy.sh` refuse `MONITORING=on` without the two, before anything changes.
   VictoriaMetrics asks for basic auth on every path but `/health` (user `bbc`, `VM_PASSWORD`, read from its
   environment with `-envflag.enable`, never from its command line): v1.154.0 answers `/health` before the check, and
   its own `/metrics`, without `-metricsAuthKey`, falls back to the same basic auth; its self-scrape reads its metrics
   in process, so it is unaffected. Grafana's datasource sends the password; the two checks refuse `MONITORING=on`
   without it too. Grafana encrypts what it stores with `GRAFANA_SECRET_KEY` (`GF_SECURITY_SECRET_KEY`), not its
   built-in default. These keys live in `production.env`, which Compose also hands whole to production's `api`,
   `worker` and `postgres` (`env_file`), as every key there: accepted for now, since those three already hold the
   database's password and the app's secrets and the monitoring keys reach only the monitoring, inside the box; a
   file of its own per service would narrow it.
9. **The room.** MinIO is a profile of its own, `media`: `MEDIA=on` puts it back in bootstrap's start (R1b). Staging's
   API replicas and worker get 384 MB each and its Postgres 768 MB: 2 048 in all, and `API_MEMORY_STAGING`,
   `WORKER_MEMORY_STAGING` and `POSTGRES_MEMORY_STAGING` in `staging.env` give one back. The limits add up to 6 752 MB
   of 8 192: production 3 840, staging 2 048, Uptime Kuma 128, the monitoring 736 (Grafana 384, VictoriaMetrics 192,
   cAdvisor 128, node-exporter 32); a deploy adds 1 024 for a few minutes (7 776). Each of the four has a CPU limit too:
   1.3 cores in all. These are limits, not use: one-off `run` containers and the host itself are outside them. Under
   pressure the four go after staging and before production (`oom_score_adj` 300).
10. **Main's files only.** Production's monitoring reads `infra/monitoring` from the box's one checkout, its scrape
    targets and dashboards within a minute, as Caddy reads `infra/caddy`: the `api-deploy` workflow refuses a staging
    dispatch whose copy of either is not `origin/main`'s (ADR-IMPL-044).
11. **CI checks it** in a job of its own: Compose reads the files with every overlay and both profiles; VictoriaMetrics
    checks its scrape file (`-dryRun`), then runs with the compose file's flags; beside it, a throwaway Grafana starts
    with the compose file's image, environment and memory limit and the repository's provisioning, reaches it, and must
    hold the datasource, the two dashboards, the seven rules and the contact point, with no provisioning or plugin error
    in its log and no kill for memory. It pulls the four images first (a tag that does not exist fails there), and runs
    each rule's query, as Grafana loaded it, on sample points for every name the rules read
    (`infra/monitoring/ci/sample-metrics.txt`): a rule that returns nothing fails the job.

**Rejected.**

- Prometheus and Alertmanager: two containers for what VictoriaMetrics does in one, at several times its memory and disk
  for the same series. vmalert: alerting is Grafana's already.
- Grafana Cloud: an agent on the box all the same, and the box's numbers kept by a third party; its free plan keeps 14
  days.
- Loki and traces now: the memory is not there while staging shares the box (ADR-IMPL-010).
- `postgres_exporter`: `db-observe` already sets what the dashboards read.

**Not in this ADR.** Logs and traces wait for staging's own machine. Caddy's own metrics are not scraped (the API counts
its requests; Cloudflare counts the edge). Uptime Kuma stays the pager for "API down". The performance work the
dashboards measure has its own ADRs. ADR-IMPL-010's open decision on MinIO stays open.

**Consequences.**

- Nothing starts until `MONITORING=on`. The first time, an existing MinIO container keeps running until it is stopped by
  hand (RUNBOOK § Monitoring): `MEDIA=off` keeps bootstrap from starting it, and nothing removes it. R1b turns it on
  with the sum in view: 7 008 MB with the monitoring.
- A branch that changes `infra/monitoring` reaches staging after its merge, as one that changes `infra/caddy` does.
- Staging has a quarter less memory. A staging container that grows past its limit is killed first, as before, and the
  memory alert names it at 90 %. The monitoring's own four are watched the same way.
- `track_planning` costs a little on every statement: under many connections that update the same few entries it can
  contend (PostgreSQL's documentation). PgBouncer keeps the connections few. If Postgres's CPU shows it, the flag goes,
  with Postgres recreated again.
- An API replica's `/metrics` no longer has `bbc_queue_*`; the worker's has them (RUNBOOK § Daily shape, § The queue is
  stuck).
- cAdvisor runs privileged and reads Docker's directory and socket: whoever controls that container controls the host.
  It has no published port and no internet, and a CPU cap of 0.2 of a core. A production deploy starts it again if it
  was stopped, so a cAdvisor that costs too much is slowed down by a PR (RUNBOOK § Monitoring).
- Grafana reads its datasource, contact point and alerts when it starts: a change to them needs a restart. Dashboards
  and the scrape file are read again each minute. Its `provisioning/plugins` folder exists, empty: Grafana logs an error
  at every start without it.
- Grafana's 384 MB are under the 512 MB Grafana 13 documents as its minimum; it fits with one data source plugin. The
  memory panel and alert watch it, and RUNBOOK § Monitoring says how to give it 512 MB.
- `vm_data` holds about 1–2 GB at 90 days (a few thousand series; each deploy's new replicas start new ones); RUNBOOK
  § Disk filling up applies to it like to any volume.
