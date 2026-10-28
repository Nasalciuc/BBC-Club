# RUNBOOK — BBC Club infrastructure

Written for someone who has never seen this system. Every command is copy-paste. If a step needs judgement, it says so.

**Machine:** one EU VPS, `/opt/bbc`, Docker Compose (one project; staging = extra services `api-staging`/`postgres-staging` on the same box). **Only 22, 80, 443 are open.** Everything else (Postgres, MinIO, GlitchTip, Kuma, Grafana) is reachable only through an SSH tunnel:

```bash
ssh -L 5432:localhost:5432 -L 3001:localhost:3001 root@<host>   # then connect to localhost
ssh -L 3000:127.0.0.1:3000 root@<host>                          # Grafana (MONITORING=on): http://localhost:3000
```

**Alerts:** `#bbc-ops` (disk, queue, failed jobs, crash-free, code mails that fail — "Postmark down / OTP not arriving"; with `MONITORING=on`, Grafana's five, § Monitoring) · `#bbc-sec` (5xx bursts, rate-limit anomalies, DLQ, failed restore) · phone escalation only for "API down > 5 min" from Uptime Kuma.

---

## Daily shape

```bash
cd /opt/bbc
DC="docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env"
$DC ps
$DC exec -T api bun -e "fetch('http://localhost:8000/status').then(r=>r.text()).then(t=>console.log(t))" | jq   # db, queue, staleJobs, failingJobs (503 when unwell)
$DC exec -T api bun -e "fetch('http://localhost:8000/metrics').then(r=>r.text()).then(t=>console.log(t))" | grep -E 'http_|process_|event_loop'
$DC exec -T worker bun -e "fetch('http://localhost:8001/metrics').then(r=>r.text()).then(t=>console.log(t))" | grep -E 'queue_|db_|pgbouncer_'
```

Request counters on `/metrics` are **per Bun process**; `exec` asks the first API replica. Caddy answers 404 for `/metrics`, `/ready`, `/status` and `/worker-metrics` to every address but its own: closed from the internet, and to a `curl` on the box too, which reaches Caddy from Docker's bridge address. The commands above ask each process directly. `/ready` is that one process — not draining, its database answers — and is what deploys wait on; `/status` is the system — the queue (nothing pending over 5 minutes, no dead letter) and every scheduled job on time (`staleJobs`) and not failing (`failingJobs`: its last finished run failed; the next run that succeeds clears it) — and is what Uptime Kuma watches. A dead letter turns `/status` red and leaves `/ready` green, so the deploy that fixes it still rolls. Database gauges (`db_connections`, `db_oldest_tx_seconds`, `db_lock_waits`, `db_deadlocks_total`, `pgbouncer_*`, the `db_statement*` totals) are set by the worker job `db-observe`, and the queue's gauges are the worker's too, where the poller runs: they are on the worker's `/metrics` (port 8001), the third command. Two of its thresholds POST from that process to `OPS_WEBHOOK` (§ Database health). With `MONITORING=on`, VictoriaMetrics scrapes every process each 30 s and Grafana shows and alerts on it (§ Monitoring); without it, the commands above are the view. Per-IP read limits are in each process's memory: with N replicas a client can receive up to N × the limit until a shared store exists.

GlitchTip uses **its own Postgres** (`glitchtip-postgres`). It is not in the pgBackRest stanza.

## Deploy

```bash
flock /var/lock/bbc-deploy.lock bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<sha>      # staging: deploy.sh staging <image>
```

`LOADTEST=1` in production.env is refused. Image tags must be a commit SHA (`:latest` is rejected).

The `api-deploy` workflow holds `/var/lock/bbc-deploy.lock` from its `git checkout` to the end of the deploy, so two dispatches never swap the shared checkout under each other; its SSH step has an hour in all, up to 25 minutes of it waiting for the lock. By hand, `flock` (above) waits its turn the same way. A staging dispatch whose `infra/caddy` or `infra/monitoring` differs from `origin/main`'s stops before its checkout: production's Caddy and monitoring read those directories from this checkout (§ Staging on the same box).

Before step 1, nothing changes unless `staging.env` sets no key that production's services read (§ Staging on the same box), the origin certificate passes `origin_tls_check` (§ Certificates), and N, the number of API replicas, is 1–9: `API_REPLICAS` (`API_REPLICAS_STAGING` on staging), default 2, read the way Compose reads it — the shell, then `staging.env`, then `production.env`.

Sequence: (1) `pg_dump` (2) pull API+worker images, then `scripts/check-env.ts` in the new image, as the API and as the worker: the server's own boot rules on this env file. A failed pull or a refusal (which names the setting) puts the previous image tag back and stops; nothing else has changed (3) migrate with a **direct** `DATABASE_URL` to Postgres — never PgBouncer (4) `up -d --no-deps` the pooler — never Postgres, which takes new settings only when recreated on purpose (§ Memory and replicas) — then start **one** new replica and wait `CANARY_SECONDS` (600, or 120 on staging), then compare its `/metrics` with an old replica (`scripts/canary-compare.ts`): abort when `/ready` fails, when the 5xx ratio exceeds `max(1%, 2× old)`, or when p99 is two buckets worse; under 50 requests judge only `/ready` and zero 5xx (5) scale API to the replicas there were plus N (2N, unless `API_REPLICAS` just changed; a stopped container counts, as Compose counts it), wait `/ready` on the other new containers, SIGTERM the old generation (drain: `/ready` 503 for 5 s then `server.stop(false)`), scale back to N (6) recreate the **single** worker (never two pollers), wait `/ready` on 8001, then force-recreate cron so `API_URL` is the worker (7) staging only: the demo data (8) Caddy, where the box has one, takes this commit's Caddyfile — a one-off `caddy validate` first (certificates included), then `up -d --no-deps caddy`, which makes a new container only when one of its four settings changed, then a graceful `caddy reload`. Caddy serves production too, so a staging deploy applies `infra/caddy` only when it is exactly `origin/main`'s; a branch's is validated and left for review. Then old API images are removed, except this one, the one it replaced, the other environment's and the five newest. A Caddy failure leaves the API deployed and Caddy on its previous config, and the deploy reports it red. `rollback_and_exit` restores the previous image tag and brings API+worker back. It reports that rollback only after `/ready` is green on every restored API replica, and on the worker at port 8001 when the previous image has one.

Compose healthcheck is `/health`; the deploy gate is `/ready`. Caddy `api_site` resolves replicas with `dynamic a` (refresh 5 s), `least_conn`, passive health on 5xx.

After `shared_preload_libraries=pg_stat_statements` changes, Postgres must restart once for the library to load; `CREATE EXTENSION` is migration `0020`.

### The first deploy of R1 (once)

- A `staging.env` made from the old example sets `INTERNAL_API_SECRET`, `MINIO_USER` and `MINIO_PASSWORD`. Production's cron and MinIO read those names too, and got staging's values. The deploy stops before step 1 and names them; remove them (staging's services now take `INTERNAL_API_SECRET_STAGING`):
  ```bash
  sed -i '/^\(INTERNAL_API_SECRET\|MINIO_USER\|MINIO_PASSWORD\)=/d' infra/env/staging.env
  ```
- A secret left as in the example, with only a comment after the `=` (`OPS_LINK_SECRET=   # min 32 characters…`), is that comment to Compose. The deploy stops at step 2 and names it: write the secret on that line. Any other setting left that way gets a ⚠ line in the deploy log.
- Production runs 2 API replicas unless `production.env` sets `API_REPLICAS`; it used to be 4.
- Caddy is recreated once (new mounts, and its four settings instead of all of `production.env`): a few seconds without traffic, at the first production deploy or the first staging deploy of `main`.
- MinIO keeps the credentials it started with — staging's, from the old `staging.env` — until it is recreated once with production's: `docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env up -d --no-deps minio`. Nothing in the app uses it yet; before R1b at the latest.
- Postgres keeps its old container settings until it is recreated on purpose (§ Memory and replicas); `oom_score_adj` -500 and the 60 s stop grace period start then. On staging, step 4 recreates `pgbouncer-staging` once (its new memory limit): a moment of errors on staging only.
- Uptime Kuma monitors made before R1 watch `/ready`, which now answers for one process: point the system monitor at `http://api:8000/status`, red on a dead letter, a stuck queue, a scheduled job gone late (a stopped worker shows there) or one whose last finished run failed.
- Until Caddy takes R1's Caddyfile, the old one sends `/status` to the API like any path, so it answers from outside: the queue's counts and the names of late jobs, nothing about members.

## Roll back right now

```bash
flock /var/lock/bbc-deploy.lock bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<previous-sha>
```

`flock` waits for a deploy that is still running; one whose canary fails rolls itself back first. Roll back from the box, as above: this checkout's `deploy.sh` with an older image. Never by dispatching `api-deploy` on an older commit, which checks that commit out — its `deploy.sh`, compose files and Caddyfile.

**An image from before R1** refuses `PUSH_ADAPTER=live` without the APNs keys, and its `/ready` is red while a dead letter or a late job exists: its canary fails and the deploy returns to the R1 image. Set `PUSH_ADAPTER=recording` and clear the dead letters first. It has no `scripts/check-env.ts`, so step 2 only warns.

Schema is expand-only, so a later image always runs against the current database. If `apps/api/src/worker.ts` is missing from the previous image, `rollback_and_exit` does not start the worker. It brings the API up through `compose.pre-worker.yml` (direct Postgres, `DB_POOLER=none`) and points cron at `http://api:8000` (`compose.pre-worker.staging.yml` on staging). An image that contains the worker entrypoint rolls back with the current compose. Either path reports the rollback only after `/ready` on the restored API; the worker is checked on 8001 only when that image has `worker.ts`.

## Database health

Gauges (worker job `db-observe`, every minute, on `/worker-metrics` and the worker's `:8001/metrics`):

| Gauge                           | Meaning                                                                         | Action                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `bbc_db_connections{app,state}` | `pg_stat_activity` by `application_name` and `state`                            | A pile of `idle in transaction` → find the PID, terminate if stuck                                       |
| `bbc_db_oldest_tx_seconds{app}` | Oldest open transaction per app                                                 | **> 30 s** posts to `OPS_WEBHOOK` (Slack-compatible). Kill the session or the job that opened it         |
| `bbc_db_lock_waits`             | `pg_locks` where `NOT granted`                                                  | Rising with oldest_tx → blocking writer                                                                  |
| `bbc_db_deadlocks_total`        | `pg_stat_database.deadlocks`                                                    | Investigate the pair of statements                                                                       |
| `bbc_pgbouncer_waiting_clients` | PgBouncer `SHOW POOLS` `cl_waiting` (needs `PGBOUNCER_ADMIN_URL` on the worker) | **> 0 for 2 minutes** posts to `OPS_WEBHOOK`. Raise `default_pool_size` only after checking slow queries |

The worker also sets PgBouncer's pools (`bbc_pgbouncer_clients_active`, `_servers_active`, `_servers_idle`, `_max_wait_seconds`) and its totals from `SHOW STATS` (`bbc_pgbouncer_transactions_total`, `_queries_total`, `_wait_seconds_total`, `_client_parses_total`, `_server_parses_total`, `_binds_total`: a bind with no server parse runs a statement prepared before), and the database's `pg_stat_statements` totals (`bbc_db_statements_total`, `bbc_db_statement_plans_total`, `bbc_db_statement_exec_seconds_total`, `bbc_db_statement_plan_seconds_total`). The totals are counters: read them as rates (Grafana's `the app` dashboard does).

These two thresholds are the worker's own, posted to `OPS_WEBHOOK`; the other alerts are Grafana's (§ Monitoring).

Postgres ends a session that sits **idle in a transaction for 60 s** (role setting, migration 0027): its locks go and vacuum can move again. Nothing in the app waits that long inside a transaction (an event handler's ceiling is 30 s). In `psql`, a `BEGIN` you will keep open longer while you think needs `SET idle_in_transaction_session_timeout = 0;` first in that session.

**Weekly report** (job `db-report`, Mondays 09:00 UTC) and live `GET /v1/internal/db-report` (`ops:read`, operator JWT):

```bash
# worker directly (the route is on every role; the job that fills the report runs here)
docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env exec -T worker \
  bun -e "fetch('http://localhost:8001/v1/internal/db-report',{headers:{Authorization:'Bearer <operator-jwt>'}}).then(r=>r.text()).then(console.log)"

# or from anywhere, through Cloudflare: the operator JWT is the lock
curl -sS -H "Authorization: Bearer <operator-jwt>" https://<API_DOMAIN>/v1/internal/db-report | jq
```

The JSON has `statsAgeDays` and `statementsReset` from `pg_stat_statements_info` (that is the statement-report age; `pg_stat_statements_reset()` moves it). `statsReset` stays `pg_stat_database.stats_reset`, the database-wide reset time. It also has the 20 slowest statements by mean and by total time (`pg_stat_statements`), unused non-unique indexes, and dead-tuple ratios. **A laptop or CI database is not production.** Do not commit those dumps. The report is meaningful after **≥ 7 days** of traffic (`meaningfulAfterDays`). On a fresh cluster every index shows `idx_scan = 0`. `idx_scan = 0` is not proof an index is unused until you know when that index was created or last reset: `pg_stat_reset_single_table_counters` can zero one index without moving `statsReset`.

Trigger now: `POST /v1/internal/run/db-report` with `X-Internal-Secret` against the **worker** (`http://worker:8001`).

**Retention (ADR-IMPL-077).** Four daily jobs delete, 5 000 rows a statement, what is kept only for a while — `retention` (04:00: done deliveries after 30 days, dead letters after 90, `kafka_processed` after 14, job runs after 30 days but each job's last, the journal's partitions after 24 months), `retention-auth` (04:10: sessions 7 days after they expired, verifications a day after, Better Auth's rate-limit rows idle for 2 hours, OTP cooldowns after a day), `retention-notifications` (04:20: notifications that reached their end after 90 days — never a pending or sending one — and done campaigns after 180) and `retention-demand` (04:30: search counts after 400 days). Requests, their events, offers and fares are records and are never deleted here. Each run's counts are in its `job_runs.metrics`; a run that hit its bound (200 batches) carries on the next night. Run one now: `POST /v1/internal/run/<name>` against the worker.

## Tuning a statement

Production never logs a plan (ADR-IMPL-077): `auto_explain` is loaded there but off (no `auto_explain.log_min_duration`,
so -1), and nothing switches it on — a custom plan writes a statement's bound values into its conditions as text (an
email, a session token). `db:verify` warns when a role or database setting turns `auto_explain.*` or
`log_min_duration_statement` on for the app's role. A statement is tuned in two places:

1. **On production, its generic plan.** Take the statement's text from `pg_stat_statements` (the db report's slowest,
   or the first query below): Postgres has already put `$1`, `$2`, … in place of every value. `EXPLAIN (GENERIC_PLAN)`
   (Postgres 16) plans that text without any value and runs nothing:

   ```bash
   docker compose ... exec -T postgres psql -U bbc -d bbc -Atc \
     "SELECT queryid, calls, round(mean_exec_time::numeric, 1) AS ms, query FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20"
   docker compose ... exec -T postgres psql -U bbc -d bbc -c 'EXPLAIN (GENERIC_PLAN) <the text, $n and all>'
   ```

   `pg_stat_statements` replaces the constants the code writes into the SQL too (`eqConst`, `inConst`): a status list
   reads `status IN ($1, $2)`. Put those back as the code writes them, since a partial index matches only on them. A
   `$n` whose type Postgres cannot tell (`could not determine data type of parameter $1`) takes a cast (`$1::text`).
   Postgres refuses `GENERIC_PLAN` with `ANALYZE`: on production a statement is never run to be timed.

2. **Its run, `EXPLAIN (ANALYZE, BUFFERS)`, on staging only**, with values written by hand; staging also logs the
   estimated plan of any statement over 500 ms by itself. At volume, on a local database seeded by
   `bun run --filter @bbc/db db:seed:volume` (it refuses `NODE_ENV=production`, which staging runs with).

The bound values stay out of every log: `log_parameter_max_length=0`, `auto_explain.log_parameter_max_length=0`, and
`log_error_verbosity=terse`, which leaves out an error's DETAIL (`Key (email)=(…) already exists`). Checked on
Postgres 16.

## Stop a runaway feature without deploying

```bash
docker compose ... exec -T postgres psql -U bbc -d bbc \
  -c "INSERT INTO platform.flags(key,value) VALUES ('personalization.killed','{\"enabled\":true}')
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();"
```

Modules: every module the API runs — `identity`, `members`, `catalog`, `requests`, `proposals`, `engagement`, `notifications`, `personalization` and the others in `apps/api/src/modules.ts` (one list: `/v1/app-config` names them all, ADR-IMPL-075). Within a second every process answers the module's routes 503 — and the routes that read it too (Home reads `members` and `proposals`) — and pauses its consumers; the next boot stops mounting them. A process that cannot read the flags for 10 s counts every module killed until it can again.

**Prepared statements off** (ADR-IMPL-074), if PgBouncer or Postgres misbehaves with them: `DB_PREPARE=off` in the environment's env file, then `up -d --no-deps` the api replicas and the worker. Every statement is then sent unnamed and planned at each call, as before 074 — slower, nothing else changes.

Boot unmounts a module only for a flag the database answered with. An api or worker that starts before
postgres/pgbouncer (a host reboot: restart policies ignore `depends_on`) waits for the database for about 16 s (retries
after 0.5, 1, 2, 4 and 8 s), then logs `boot: database unreachable, exiting` and exits non-zero; Docker's
`unless-stopped` starts it again (ADR-IMPL-058).

## Pause one event consumer (e.g. a handler writing bad data)

```sql
INSERT INTO platform.flags(key,value) VALUES ('consumer.crm.onOfferResponded.paused','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
```

Deliveries queue up as `paused`; resume with the same flag `false`, then `poller.resume(consumer)` via `POST /v1/internal/run/queue-health`.

## Price rules for estimates (ADR-IMPL-037)

The company's price rules are not in the repository. The owner keeps `pricing-rules.json` (one line of JSON) off the
server and pipes it in over SSH, so it never lands on the disk. Check first — `--dry-run` prints the fingerprint and the
poster check and writes nothing — then write:

```bash
# staging
ssh <server> 'docker exec -i "$(docker ps -qf name=bbc-api-staging | head -1)" bun run scripts/load-pricing-rules.ts --dry-run' < pricing-rules.json
ssh <server> 'docker exec -i "$(docker ps -qf name=bbc-api-staging | head -1)" bun run scripts/load-pricing-rules.ts' < pricing-rules.json
# production: through the single worker (a name filter for the API would also match staging)
ssh <server> 'cd <checkout> && docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env exec -T worker bun run scripts/load-pricing-rules.ts --dry-run' < pricing-rules.json
ssh <server> 'cd <checkout> && docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env exec -T worker bun run scripts/load-pricing-rules.ts' < pricing-rules.json
```

Windows PowerShell has no `<`: `Get-Content -Raw pricing-rules.json | ssh <server> '…'` does the same.

Before loading a new file, compare it with the company's site (ADR-IMPL-062) — on any computer with the repository, or
on the server as above with `--check-site` in place of `--dry-run`:

```bash
bun run scripts/load-pricing-rules.ts --check-site < pricing-rules.json
```

It asks the site's own search for 24 routes (two per continent pair, both trips; Istanbul, Québec and Seville among
them), one at a time, half a second apart, and prints per cabin how many matched, differed or got no answer, and the
routes that differ — never a price. It writes nothing. Exit 1: a route differs — those rules are not the ones the site
prices by — or the site gave no business figure for a route (a timeout, a 404, its rate limit): the check did not cover
it, so it is not a pass; run it again. A route without a first-class figure does not fail it. With the reference set it
is expected to fail on the routes with a Q and on first class; the company's current rules should pass.

The poster check must equal the poster (JFK → ZRH, business, round trip). Searches use the new rules within ~35 s. Then
estimates on, in that environment's database (staging: `docker exec -it bbc-postgres-staging-1 psql -U bbc -d bbc`;
production only after the company's written approval). Off is the same with `false` (~35 s):

```sql
INSERT INTO platform.flags(key,value) VALUES ('catalog.estimates','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
```

With estimates on, a quote request whose app showed the estimate (A2c and later) carries it — stored on the request,
published with the rules' fingerprint and written into the specialist's e-mail as `Indicative estimate shown: $2,055
round trip, business (formula)` (ADR-IMPL-042); `(company site)` when the company's site priced it (ADR-IMPL-063, "The
site's prices" below). `catalog.estimates` off stops estimates everywhere, the site's prices included; `catalog.killed`
stops Explore but not the estimate a queued request may still ask for.

Which rules are live: `SELECT value->>'fingerprint', value->>'loadedAt' FROM platform.flags WHERE key = 'catalog.pricing_rules';`.
`bbc_search_estimates_unavailable{reason}`, `bbc_request_estimates_unavailable{reason}` and (with `catalog.site_pins` on,
ADR-IMPL-045) `bbc_home_estimates_unavailable{reason}` rising while estimates are on:
`missing` — load the rules; `invalid` — they were edited by hand, load them again; `error` — the rules row could not be
read (the database or Redis, not the rules: look for `pricing rules unreadable` in the API log, and do not reload them);
for requests `error` also counts a failed catalog read (`request estimate unavailable` in the API log), and `timeout` one
that took over a second — those quotes went through without the estimate. `bbc_request_estimates_stored{cabin}` counts the estimates that reached a request.
Never edit that row by hand; never paste the file into a chat, an issue or a log.

## A request that was never sent (ADR-IMPL-042)

`send-requests` passes each request to the CRM within a minute; a failure is tried again every five minutes, six times.
With `CRM_ADAPTER=http` (ADR-IMPL-065) a request the CRM refused as it is — a 4xx other than 408 and 429, or a
redirect — is given up at once (`refused: true` in the log, `last_error` `CrmHttpError: CRM submitRequest answered 400
(permanent)`); a timeout, a network error, a 408, a 429 or a 5xx is tried again. Then it gives up: the log says
`request send gave up` (with the request id), `bbc_request_sends_given_up` rises on the worker's metrics,
`OPS_WEBHOOK` gets one line, and the member reads `Not sent` — with a call button from the A2c app on when the build
has the general line, else that we will try again and that there is no need to send it again; older apps still say it
is saved on the phone. Nothing resends it by itself. Fix the cause (the CRM, its address or secret, `OPERATORS_EMAIL`,
Postmark — the log line has the error), then re-queue it; the next minute's run sends it. Before you re-queue, look for
a newer request from the same member for the same trip (one they sent again, or one a specialist took by phone after
their call): if there is one, close the older request instead (`POST /v1/internal/requests/<uuid>/status` with
`X-Internal-Secret` and `{"status":"closed"}`), so the specialists do not get the trip twice under two references.

```sql
SELECT id, reference, send_attempts, last_error, created_at FROM requests.requests
WHERE sent_to_crm = false AND status <> 'closed' AND send_attempts >= 6 ORDER BY created_at;
-- The member's later requests, with their legs to compare:
SELECT id, reference, status, legs, created_at FROM requests.requests
WHERE member_id = (SELECT member_id FROM requests.requests WHERE id = '<uuid>')
  AND created_at > (SELECT created_at FROM requests.requests WHERE id = '<uuid>') ORDER BY created_at;
UPDATE requests.requests SET send_attempts = 0, sent_at = NULL WHERE id = '<uuid>' AND sent_to_crm = false;
```

A request still waiting after 45 minutes with fewer attempts means the worker is not running the job: check the worker
(`/ready` on 8001) and `platform.job_runs` for `send-requests`. Nothing alerts on this by itself: every `OPS_WEBHOOK`
post comes from the worker, so a stopped worker posts nothing — an outside check on `/ready` at 8001 (an uptime
monitor) is the alert, when one is set up.

The note in a request's e-mail is the member's own text, quoted (`> `) under `Note from the member:` — a link in it is
the member's, not ours. A status note sent with the internal status webhook (`POST /v1/internal/requests/:id/status`,
`note`) is shown to the member under the current step of the request's timeline: write it for the member.

## Place photos (ADR-IMPL-043)

The app asks for the photo of each city it shows (`GET /v1/places/photos?codes=`). A city asked about for the first
time gets a row in `catalog.place_photos`, and `resolve-place-photos` (worker, every minute, ten cities a run, new ones
first) looks it up: Wikimedia Commons through Wikidata; then Pexels, only when `PEXELS_API_KEY` is set (three
questions a run at most — Pexels allows 200 an hour, 20,000 a month); else the satellite view, which the app draws
from Mapbox with its `pk.` token. Until a city is looked up, and whenever a photo does not load, the app shows its own
image. Every city is looked at again after 30–33 days. Only addresses and credits are stored — never an image. A run
starts no request after its first 32 s (each may take 8; the job is stopped at 50): when the sources are slow, the
cities it has not reached are put back (`deferred` in the run's counts in `platform.job_runs`), their look not counted.

What Commons may give a city (ADR-IMPL-043, amended by ADR-IMPL-064): a JPEG photograph in landscape (1.2 to 2.4 wide
for 1 high), wider than 1280 px, under CC0, public domain, CC BY / BY-SA or the Free Art License (`FAL`), with its
author whenever the licence asks. A TIFF, PNG, SVG or GIF never (on Commons a TIFF is mostly a scan or a satellite
image: the one a site city had was).

**A landmark stands in** (ADR-IMPL-064, amendment 1): while `catalog.landmarks` is on (Landmarks, below), a city whose
row is `satellite` is answered with its first landmark's photograph instead, credited as that photograph
(`Photo: <author> · <licence> · Wikimedia Commons`, linked to its Commons page). A city not looked up yet (`pending`)
is not: phones ask about it again within a minute, and would keep a stand-in for twelve hours past the city's own photo.
The route composes it on each answer and never stores it: the row stays as it is and the job looks again on its own
schedule, so a photo the city gets later, or an operator's photo, wins on the server's next answer. Phones keep a photo
they have read for up to twelve hours, or until the app restarts: a change reaches a phone that already shows the city
only then. To see which cities show one (the flag's `skip` aside):

```sql
SELECT p.code, p.status, l.rank, l.landmark_qid, l.name, l.licence
FROM catalog.place_photos p
JOIN LATERAL (SELECT * FROM catalog.place_landmarks x
              WHERE x.code = p.code AND x.kind = 'landmark' ORDER BY x.rank LIMIT 1) l ON true
WHERE p.status = 'satellite';
```

A stand-in the city should not have: put its `landmark_qid` in the flag's `skip` (Landmarks, below) — the server then
answers with the next landmark, or the satellite view when none is left, within ~35 s — or give the city the club's own
photo (below). Either way, phones that already show the stand-in keep it for up to twelve hours (or until the app
restarts): the photos route has no revalidation, so nothing on the server reaches them sooner. A photograph Commons
deletes is not taken down by the deletion: the landmark's row keeps its address until the landmarks job looks at the
place again (30–33 days), so the server keeps answering it; a phone that has shown it keeps drawing it from its image
cache (a photograph is kept on disk, across restarts), and only a phone that never loaded it shows the slot's fallback
(the club's image, or the light tint). Take it down as any stand-in — its `landmark_qid` in `skip`, or the club's
photo: the address changes, and the twelve hours above hold. A faster takedown than that is an app change.

The worker reaches `query.wikidata.org`, `commons.wikimedia.org` and `api.pexels.com` over 443; members' phones load
the photos from `upload.wikimedia.org` (or Wikimedia's newer thumbnail host) and `images.pexels.com`, and satellite
views from `api.mapbox.com`.

What a city shows, and what is waiting:

```sql
SELECT code, status, source, author, license, link, attempts, resolved_at, expires_at
FROM catalog.place_photos WHERE code = 'LHR';
SELECT status, count(*) FROM catalog.place_photos GROUP BY status;
```

A wrong or poor photo: give the city the club's own — two https addresses (a card about 500 px wide, a full-width one
about 1280 px), and a credit only if the photo needs one. It never expires and the job never touches it; `DELETE`
hands the city back to the job. Through the worker, so the secret is read from its environment and never typed:

```bash
docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env exec -T worker \
  bun -e "fetch('http://localhost:8001/v1/internal/places/LHR/photo',{method:'PUT',headers:{'X-Internal-Secret':process.env.INTERNAL_API_SECRET,'Content-Type':'application/json'},body:JSON.stringify({card:'https://…/lhr-500.jpg',hero:'https://…/lhr-1280.jpg',credit:{author:'…',license:'CC BY 2.0',link:'https://…'}})}).then(async r=>console.log(r.status,await r.text()))"
# back to the job (the same command with method:'DELETE' and no body) — 204, or 404 when the city has no photo of ours
```

After setting `PEXELS_API_KEY` (restart the worker), let the satellite cities be looked at again now rather than within
a month: `UPDATE catalog.place_photos SET expires_at = now() WHERE status = 'satellite';`. The same line after the release
that accepted the Free Art License (ADR-IMPL-064, amendment 2): the cities it rescues get their own photo within
minutes (ten a minute) instead of within a month.

A city stuck on an old satellite view: read its row, then let the job look again now. Chișinău (RMO) is one: Wikidata
answers the club's code, RMO, with the city and its photographs, so its `satellite` row is one resolved before this
release (it waits out its 30–33 days otherwise) or one whose look a 429 cut short (before ADR-IMPL-064 that put it off
for up to a day). The same lines, with the city's own code, also bring back now the cities that got no photo before
ADR-IMPL-064 for reasons it fixed: an airport the club keeps under a code Wikidata has since demoted (now matched at
any rank), and a city whose airport Wikidata does not know (now found by its name):

```sql
SELECT code, status, source, author, license, attempts, resolved_at, expires_at
FROM catalog.place_photos WHERE code = 'RMO';
UPDATE catalog.place_photos SET expires_at = now() WHERE code = 'RMO' AND status = 'satellite';
```

Within a minute (unless a hold is on, below) the row is `photo` with a Wikimedia credit — for RMO the cathedral's night
view — or `satellite` again if Commons has no photograph that passes. Never on an operator's photo (`source =
'override'`): that is `DELETE …/photo`'s job.

Wikimedia asks a client it wants slower to wait (429 with `Retry-After`: WDQS up to 1000 s during an outage, Commons
20–60 s). That is not the city's fault: the cities claimed wait that long, their look not counted, and the source is held
for both Wikimedia jobs (place photos and landmarks) until `not_before`; a run that claims cities meanwhile asks nothing
and puts them back. The holds, and ending one early (only when the 429 came from something already fixed):

```sql
SELECT source, not_before, not_before - now() AS left FROM catalog.source_holds;
UPDATE catalog.source_holds SET not_before = now() WHERE source = 'wikidata';
```

Off: the flag row `catalog.place_photos` (seeded on by `scripts/seed-flags.ts`) — `{"enabled":false}` and within ~35 s
the route answers no photos (the app shows its own image everywhere) and the job asks nothing outside:

```sql
INSERT INTO platform.flags(key,value) VALUES ('catalog.place_photos','{"enabled":false}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
```

Metrics: `bbc_place_photos_resolved{status,source}` (photos and satellite views written), `bbc_place_photos_failed{stage}`
(`wikidata`, `commons`, `pexels`: the source failed and the city is tried again after as many hours as it has tried,
a day at most; `write`: the database refused a row; `airport`: a claimed city the airports query cannot match — a code
not in upper case — tried again the same way, log line `place photos: no airport for a claimed city`),
`bbc_place_photos_requested` (cities asked about for the first time). The log line `place photos: a source failed`
carries the stage and the error — never the Pexels key; `place photos: a source asked the club to wait` carries the stage
and the seconds, and `bbc_place_photos_held{stage}` counts the holds. An error `place photos: Pexels refused PEXELS_API_KEY` (401)
means the key is wrong or revoked: until it is replaced, a city that shows a photo keeps it, and one Commons has no
photo for gets its satellite view, looked at again each day.

## Landmarks (ADR-IMPL-064)

The app asks for a destination's landmarks (`GET /v1/places/:code/landmarks`): up to three, each with its photograph's
address on Wikimedia, its size and its credit, from `catalog.place_landmarks` at once. `resolve-place-landmarks`
(worker, every five minutes, two places a run) looks up the cities the app has shown a photo for and the site's
cities: one WDQS question a city (a second when the city item it remembers answers nothing; 3–33 s, WDQS stops one at
60 s) and Commons once per 50 files, a hundred files at most (two questions). A city is looked at again
after 30–33 days; a look that failed, after six hours (what the city had stays). Only addresses and credits are stored.
A place starts only while its slowest look (162 s) can end inside the run's 225 s (the job is stopped at 240): when
WDQS is slow the second place waits for the next run, untouched (`later` in the run's counts in `platform.job_runs`).

On: the flag row `catalog.landmarks` (seeded off by `scripts/seed-flags.ts`, with the skip list below). Off, the route
answers no landmarks, the job asks nothing, and no landmark stands in for a city photo:

```sql
UPDATE platform.flags SET value = jsonb_set(value, '{enabled}', 'true'), updated_at = now() WHERE key = 'catalog.landmarks';
```

What a city shows, and how far the job has got:

```sql
SELECT rank, kind, city_qid, landmark_qid, name, licence, credit, fetched_at, expires_at
FROM catalog.place_landmarks WHERE code = 'CDG' ORDER BY rank;
SELECT kind, count(*) FROM catalog.place_landmarks GROUP BY kind;
```

`landmark` rows are shown, best first; a `fewer` row after them means the job found fewer than three and will not ask
again for a month (rank 1 and `city_qid` null: no city found for the airport); a `failed` row alone means no look has
worked yet (the job tries again in six hours).

A wrong or unwanted landmark: add its Wikidata item (`landmark_qid`) to the flag's `skip` list — the route leaves it out
within ~35 s; an app that already showed the city drops it at its next question for it, never sooner than 12 hours after
the app's last answer for that city: within a minute of them while a screen showing the city is on screen, else when one
next is, or at the app's next cold start. The server's city photo it may stand in for changes as fast, but phones that
already show that photo keep it for up to twelve hours (Place photos, above); a destination never shows the stand-in's
photograph twice, whichever of the two a phone has refreshed first (it compares photographs, not landmarks: a look that
gives the same landmark another file can show it in both for up to twelve hours). Then let the city be looked at again
so that another takes its place. The seeded list holds Q177174, Reykjavík's most written-about sight (the Icelandic
Phallological Museum):

```sql
UPDATE platform.flags SET value = jsonb_set(value, '{skip}', coalesce(value->'skip', '[]') || '["Q243"]'), updated_at = now()
WHERE key = 'catalog.landmarks';
UPDATE catalog.place_landmarks SET fetched_at = now() - interval '1 minute', expires_at = now() WHERE code = 'CDG';
```

A 429 from WDQS or Commons holds that source (`catalog.source_holds`, above) for its Retry-After and stops the run: no
place is marked for it. Metrics: `bbc_place_landmarks_resolved{found}` (places written, by how many landmarks they
got), `bbc_place_landmarks_failed{stage}` (`wikidata`, `commons`: the source failed, the places keep what they have;
`write`: the database refused a row), `bbc_place_landmarks_held{stage}`. Log lines `landmarks: a source failed`,
`landmarks: a source asked the club to wait`, `landmarks: write refused`. The worker reaches `query.wikidata.org` and
`commons.wikimedia.org` over 443; phones load the photographs from `upload.wikimedia.org`.

## Member photos (ADR-IMPL-070)

A member's own photo is in Postgres, `members.profile_photo`: one row per member, a 512 × 512 WebP of at most 100 KB
without metadata, served only to that member by `GET /v1/profile/photo` (no public address, nothing in MinIO). It goes
with the account (`member.deleted`, and the FK from the profile), so backups and the restore drill carry it like any
other row. Only a build from 0.3.0 can choose a photo. An older build that took an update over the air shows the `Photo`
row only when the member already has a photo, and offers `Remove photo` alone.

How many, and how much room they take:

```sql
SELECT count(*), pg_size_pretty(sum(byte_size)::bigint) AS bytes, max(byte_size) FROM members.profile_photo;
SELECT pg_size_pretty(pg_total_relation_size('members.profile_photo'));
```

A member asks for their photo to be removed and cannot do it in the app (Edit profile → Photo → Remove photo):
`DELETE FROM members.profile_photo WHERE member_id = '<member id>';` — their portrait shows their initials from the
next load. Never copy a photo out of the database to look at it.

## The site's destinations (ADR-IMPL-045)

Twice a day (07:40 and 19:40 UTC; twice since ADR-IMPL-067) `sync-site-destinations` (worker) reads the company's site through its own API
— `buybusinessclass.com/api` (ADR-IMPL-062; `weba.buybusinessclass.com` until it stopped resolving): regions, their
countries, their cities, about 240 pages, one starting every 1.2 s (the API allows 120 requests a minute per address,
and staging's night, on this host at the same minute, reads beside it: about 50 a minute each), then a HEAD request for each city's photo,
four at a time — and keeps a snapshot: `catalog.site_places` (each city, its main
airport, every airport it covers, its photo's path) and `catalog.site_routes` (the US airports the site lists a price
from, that price — shown only as a site deal — and the "Old Price", never shown), each route served until
`valid_until`, a day after the run that wrote it (CHECK `site_routes_validity`, D6). The site has no airport codes: a
city is matched by name inside the country the site puts it in; the few names that need help are listed in
`SITE_CITY_AIRPORTS` (catalog `application/site-places.ts`). Three flags, all seeded off; with all three off — and
`catalog.globe_tap` off, whose cities are the site's (ADR-IMPL-068, "Tap anywhere on the globe" below) — the job asks
the site nothing.

- `catalog.site_photos`: each city's own photo on all its airports, stored as an operator's photo (it never expires, has
  no credit line, and `resolve-place-photos` never touches it). An operator's own photo from anywhere else stays; one
  put by hand with an address on the site counts as the site's — the job takes it back while the photos are off, or
  its city is skipped. A city whose page shows another city's photo (Crete shows Santorini's) keeps Wikimedia's.
  `{"enabled":true,"skip":[23]}` keeps the cities listed (the site's ids: 23 is London) on Wikimedia. Off: the next
  run hands every site photo back to `resolve-place-photos`, which finds Wikimedia's again at ten airports a minute —
  about twenty minutes for all of them, the club's image meanwhile; off and `skip` work even on a night the site does
  not answer. An operator's `DELETE …/photo` on a site photo lasts until the next night: keep a city off with `skip`,
  or give it the club's own photo (`PUT …/photo` with an address elsewhere), which the job never touches. Members'
  phones load these photos from `buybusinessclass.com/storage/`. A photo stored under `weba.buybusinessclass.com` is
  still the site's: the next run moves it to the new address, or hands it back.
- `catalog.site_pins`: after the fares' pins, up to twelve of the site's cities listed from the member's home airport
  (the site's home page first, then the busiest), priced by the formula in the member's cabin (ADR-IMPL-037), so the
  pin, its search's estimate row and the quote show one number. Nothing while `catalog.estimates` is off: no price, no
  pin. With `catalog.site_prices` on, the pins show the site's stored answers, and `refresh-site-prices` keeps them
  only while this flag is on too ("The site's prices" below).
- `catalog.site_offers`: the site's deals in Explore's "Offers to inspire", after the member's own offers ("The site's
  deals" below). Needs neither of the other two, nor `catalog.estimates`.

All or nothing: a region or a country that does not answer, fewer than 80 % of last night's cities listed or placed on
their airports, or more than 10 % (at least three) city pages unanswered, and the run fails and changes nothing:
`platform.job_runs` says `failed` and why, and the worker's `/metrics` counts it in
`bbc_job_failed{job="sync-site-destinations"}`, and `/status` turns red with the job in `failingJobs` until a run
succeeds. "Last night" is the snapshot while its day has more than an hour to run (ADR-IMPL-067): a run twelve hours
after a good one is weighed against it, the run a day after is not — that snapshot serves no deal and no pin from then
on — so a site that really lists a fifth fewer cities is taken a day after its last good read, with no step of yours;
until then the failures above say so, and the deals and site pins stay on the last good read for its day. A single
city page that does not answer keeps last night's rows; a photo the site cannot be asked about (no answer, a 5xx) keeps
last night's verdict. The site's rate limit (HTTP 429) holds the read for what its `Retry-After`
asks (a minute without one, two at most), then the page is asked again; a second 429 on any page, a city's included,
fails the night — unlike a city page that merely does not answer (`site getOne?id=…: HTTP 429 again after waiting`). The
pace leaves room for staging's read at the same minute (about 50 a minute each against the address's 120), so a 429
means something else asked the site from this address. The run's counts are in `platform.job_runs`; the log
lines `site: no airport`, `site: main airport by a tie`, `site: borrowed photo`, `site: odd photo`,
`site: photo does not answer`, `site: photo not checked, kept`, `site: unknown US city` and
`site: city page did not answer, kept` name the cities. Kyoto is listed under `site: no airport` on purpose: it has no airport of its own, and Osaka's photo is
Osaka's. A city under `site: main airport by a tie` got the alphabetically first of its busiest airports: list it in
`SITE_CITY_AIRPORTS` (a PR), main airport first.

Before turning either on, see what the site holds today, with no database: `bun run scripts/site-destinations-report.ts`
on any computer with the repository reads the site as the job does (about 400 requests, paced: about six minutes),
prints a summary and writes one HTML page in the temporary folder — every city with its photo, its airports, whether its
photo answers and how heavy it is (the app shows the site's file as is), and the site's prices.

Turn one on (or off) in that environment's database (staging:
`docker exec -it bbc-postgres-staging-1 psql -U bbc -d bbc`), wait a second (every process reads the flags again
within one, ADR-IMPL-075), then, on the server, run the job instead of waiting for the night — through the worker, so the secret is read
from its environment and never typed:

```sql
INSERT INTO platform.flags(key,value) VALUES ('catalog.site_photos','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
```

```bash
# production
docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env exec -T worker \
  bun -e "fetch('http://localhost:8001/v1/internal/run/sync-site-destinations',{method:'POST',headers:{'X-Internal-Secret':process.env.INTERNAL_API_SECRET}}).then(async r=>console.log(r.status,await r.text()))"
# staging
docker exec -i "$(docker ps -qf name=bbc-worker-staging | head -1)" \
  bun -e "fetch('http://localhost:8001/v1/internal/run/sync-site-destinations',{method:'POST',headers:{'X-Internal-Secret':process.env.INTERNAL_API_SECRET}}).then(async r=>console.log(r.status,await r.text()))"
```

A night's run takes three to five minutes (up to about seven when staging's run reads the site at the same time; the
job's timeout is ten), longer than the worker's HTTP idle timeout (120 s): the command above then
ends with the connection closed while the run goes on (the cron's own call logs `FAIL` the same way). Its outcome is in
`platform.job_runs`, a few minutes later:

```sql
SELECT status, error, metrics, duration_ms FROM platform.job_runs
WHERE job = 'sync-site-destinations' ORDER BY started_at DESC LIMIT 1;
```

`succeeded` with its counts under `metrics` (`read`, `cities`, `places`, `photosSet`, …); `failed` changed nothing, and
its `error` says why; `skipped` — a run was already going: try again in five minutes. A run that ends within 120 s (the
flags off) still answers `200` with the same fields.

What the snapshot holds, and how much of it is still within its day:

```sql
SELECT cms_id, name, country, airport, airports, promoted, image IS NOT NULL AS photo FROM catalog.site_places ORDER BY name;
SELECT route_from, count(*), count(*) FILTER (WHERE valid_until > now()) AS served, max(synced_at) AS read_at
FROM catalog.site_routes GROUP BY route_from ORDER BY 2 DESC;
```

### The site's deals (ADR-IMPL-067)

With `catalog.site_offers` on (seeded off), Explore's "Offers to inspire" shows, after the member's own offers, up to 24
of the site's deals: from the member's airport and its metro first (New York is JFK, EWR and LGA), then from the nearest
city the site sells from — Seattle sees San Francisco's, Toronto Washington's, Boston its five and then New York's — one
deal per city, each card saying `from $X` (the site's "Price Today": per person, indicative; no trip, no cabin) and,
when it leaves from another city than the member's, `from New York`. Never `Save X%`: the site's "Old Price" has no
source and is never served. A tap opens the destination as a pin does. The deals are read from the snapshot, never from
the site; a deal is shown for a day after the run that read it and is gone with the next run if the site dropped it.
A run that fails changes nothing: the deals it leaves end within the day (two runs a day: one failure leaves twelve
more hours). Home keeps them a minute; the run's end shows at once.

Turn it on as the others (above): the flag row, a second for the flags to reach every process, then run `sync-site-destinations` through
the worker if the snapshot is older than a day (the query above: `served` 0). What a member at an airport sees:

```sql
INSERT INTO platform.flags(key,value) VALUES ('catalog.site_offers','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
-- Deals from JFK still served, the site's home page first, as Home orders them:
SELECT p.name, r.price, r.valid_until FROM catalog.site_routes r JOIN catalog.site_places p USING (cms_id)
JOIN catalog.airports a ON a.code = p.airport
WHERE r.route_from = 'JFK' AND r.valid_until > now() ORDER BY p.promoted DESC, a.popularity DESC LIMIT 24;
```

Off: the next Home has none (within a second), with no question to the database. On staging, once it is on,
withdraw the demo's broadcast offers ("Staging demo data", below), or Tokyo stands twice on Explore.

## The site's prices (ADR-IMPL-063)

With `catalog.site_prices` on (seeded off; it needs `catalog.estimates`, which stays the master switch), an estimate is
the company's own price from its site's search (`webapi.buybusinessclass.com/flights/search`) wherever the company
prices the route: a published fare first, then the site's answer stored less than 24 hours ago
(`catalog.site_prices`), then — an undated search only — one question to the site within a second, whose answer is
stored; the formula only where the site could not be asked. Home's site pins and a quote request never ask the site:
they read the stored answer, else the formula. Off, everything is as before and the site is never asked.

**What a `none` row means.** The site answered that the company has no price for that route — 404 `Offer not found`
(no end in North America) or `Not found` (an airport code it does not know, such as `DJT`, which it spells `PBI`). The
member sees no number at all — not the formula — and "Request a quote"; the pin is not shown. It is the company's
answer, kept 24 hours like a price. An error (a timeout, a 5xx, a 429, a body the club cannot read) stores nothing.

**Turn it on** (staging first: members' numbers change — first class appears on routes the club hid, Cyprus, Russia and
Kazakhstan get the site's prices, airports the site does not know lose theirs), in that environment's database; off is
the same with `false`. A flag reaches every process within a second:

```sql
INSERT INTO platform.flags(key,value) VALUES ('catalog.site_prices','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
```

**The job** `refresh-site-prices` (worker, every ten minutes) keeps the answers for the routes Home's site pins show:
from each airport `catalog.site_routes` lists, its first 36 cities in the pins' order, round trip. Routes without an
answer first, then answers 18 hours old or more; at most 150 questions a run, one every 500 ms. It asks only while
`catalog.estimates`, `catalog.site_prices` and `catalog.site_pins` are all on — without the pins no member sees those
routes, and a search asks for its own — and reads them again before each question, so turning one off stops a run
already going (`stopped: 1`, within a second). With one off it asks nothing (`skipped: 1`) and
still deletes the expired answers (`purged`). It stops at the site's first 429 (`rateLimited: 1` in its run) and when
the breaker opens (`breakerOpen: 1`); the next run, ten minutes later, goes on. A route the site could not answer is not
asked again for an hour (`backingOff` counts them), then after every other route due: one the site keeps failing costs
at most a question an hour and holds nothing back. The worker remembers those failures until it restarts. Run it now, as
`sync-site-destinations` above, with `refresh-site-prices` in the path. Its outcome:

```sql
SELECT status, metrics, duration_ms FROM platform.job_runs
WHERE job = 'refresh-site-prices' ORDER BY started_at DESC LIMIT 5;
```

**The breaker** (one per process, the API's and the worker's apart): five failures in a row — timeouts, 5xx, 429s,
bodies not its shape — open it for a minute; then one question goes, and its answer closes or reopens it. While it is
open the search shows the formula at once, the job asks nothing, and `bbc_site_prices_unavailable{reason="breaker"}`
counts it. Nothing to reset: it closes itself when the site answers. If the site stays down, the formula stands in
everywhere; turning the flag off changes nothing more but stops the questions — a run already going included, before
its next one.

**Watch:** `bbc_site_prices_answered{status}` (priced, none), `bbc_site_prices_unavailable{reason}` (`breaker`,
`timeout`, `error`, `invalid` — the site changed its answer's shape, `rate_limited`, `bad_request` — a request of ours
the site refused: a bug, logged `site price refused our request (400)` with the codes), and
`bbc_search_site_prices{source,how}`: how each search was priced (`site` stored or asked, `club` fallback, `none` none,
cabin or guarded). A cold start of the site's host can take seconds: the first search then shows the formula and the
next one asks again. What is stored:

```sql
SELECT status, count(*), min(fetched_at), max(fetched_at) FROM catalog.site_prices GROUP BY status;
SELECT route_from, route_to, status, fetched_at, expires_at FROM catalog.site_prices
WHERE route_from = 'JFK' ORDER BY route_to;
```

A wrong row (the company corrected a price): delete it — the next search or run asks again. Never edit a figure by hand.

```sql
DELETE FROM catalog.site_prices WHERE route_from = 'JFK' AND route_to = 'ZRH';
```

## Tap anywhere on the globe (ADR-IMPL-068)

With `catalog.globe_tap` on (seeded off), `GET /v1/home` sends `bookable`: the cities a tap anywhere on Explore's globe
may open — the site's cities (by their main airport) and the US airports the site lists a price from, from the night's
snapshot ("The site's destinations" above), with the arrivals of the member's fares and offers; never the member's home
airport nor another within 100 km of it. A formula price alone never adds a city. The app snaps a tap to the nearest of
them within 600 km and opens it as a pin's tap does (its search prices it); farther, or over the sea, it says
`No destination near there.` and points to the search; within 100 km of the member's home airport, the home answer. Off:
the field is absent and a tap off the pins does nothing, as before — an app built before this ignores the field either
way.

The list needs the snapshot: with this flag on, the night's `sync-site-destinations` reads the site even with the site's
photos and pins off. Turn it on in staging first, then run the night's job (above) if `catalog.site_places` is empty:

```sql
INSERT INTO platform.flags(key,value) VALUES ('catalog.globe_tap','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
SELECT count(*) AS cities FROM catalog.site_places;
SELECT count(DISTINCT route_from) AS origins FROM catalog.site_routes;
```

It costs Home one read of the set (kept a minute, and dropped on every process when the night's sync or an import changes it) and
about 21 KB of JSON (today's 169 airports) inside Home's ETag. Off is the same with `false`, seen within a second; the
app keeps the last Home it parsed until its next load.

## The queue is stuck (oldest pending > 5 min)

1. `$DC exec -T worker bun -e "fetch('http://localhost:8001/metrics').then(r=>r.text()).then(t=>console.log(t))" | grep queue_` — depth, age, dead. The worker's: the queue's gauges are where the poller runs (with `MONITORING=on`, Grafana's `Event queue` panel too).
2. `docker compose ... logs api --tail 200 | grep delivery` — which consumer.
3. Dead letters: `SELECT consumer, count(*), max(failed_at) FROM platform.event_dlq GROUP BY 1;`
4. Fix the cause, then replay: `POST /v1/internal/run/queue-health` or `poller.replay(<delivery_id>)`.

## Restore the database

```bash
bash infra/restore.sh                                    # latest backup
bash infra/restore.sh --to-time "2026-09-11 14:00:00+00" # point in time
```

Backups run inside the postgres container (pgbackrest lives there); schedule is in `/etc/cron.d/bbc`: full 01:30 UTC daily, diff every 6 h, restore drill on the 1st at 06:00.
Asks twice. RTO ≈ 45 min, RPO ≈ 5 min (continuous WAL). **Drill it monthly** — the cron job `restore-test` does it automatically; if `#bbc-ops` has not shown "restore drill ok" this month, run `bash infra/restore-test.sh` by hand.
The script aborts before starting the API if Postgres does not come back or the restored database does not contain all 8 schemas.

## Database recovery (a bad or stuck migration)

Migrations are expand-only and there are no down migrations. "Back" is never a reverse script. It is one of three things: the previous image, which runs against the new schema; a **new forward migration**; or, when data is lost, a restore.

**1. The deploy stopped at step 3/7: a lock timeout.** Every lock the runner takes waits at most 5 s (`lock_timeout`), so a migration can never queue live traffic behind it. The deploy log looks like this:

```text
▶ 3/7 migrations (expand-only, separate job)
migration stopped: a lock was not granted within lock_timeout (5 s) — a long-running transaction holds the table. The failed block was rolled back; the previous release keeps serving. Retry when the table is quiet (RUNBOOK: Database recovery).
migration failed: DrizzleQueryError: Failed query: ALTER TABLE …
PostgresError: canceling statement due to lock timeout
       code: "55P03"
🚨 deploy production aborted at migration. Old API still serving.
```

Nothing is half-applied: the block was rolled back and its ledger row (`platform.extras_applied`) was not written. Find what held the table:

```sql
SELECT pid, pg_blocking_pids(pid) AS blocked_by, state, now() - xact_start AS in_tx, left(query, 80) AS query
FROM pg_stat_activity WHERE datname = current_database() AND xact_start IS NOT NULL ORDER BY xact_start;
```

- **A long report or an export:** wait for it to finish.
- **A session `idle in transaction` for minutes:** end it with `SELECT pg_terminate_backend(<pid>);`.
- Then run the **same** `deploy.sh` command again. The block runs from the start.

**2. A migration applied, but it is wrong (shape or data).** Leave the previous image serving (§ Roll back right now) and write a forward fix:

1. Add `packages/db/migrations/NNNN_<module>_<desc>.sql` and its block in `scripts/migrate.ts`.
2. `migrations-registered.test.ts` fails if either is missing.
3. A destructive statement in it needs `-- destructive: <reason>` on the line above (`bun run migrations:destructive`), and it ships as its own announced PR.

Never edit a migration that already ran. Named steps that correct one another run together:
`0025_requests_estimate_pair_and_list.sql` replaces the CHECK `0024_requests_shown_estimate.sql` added, so deleting
0024's ledger row alone would run it again after 0025 and put the weaker CHECK back — delete both rows, or neither.

**A migration that did not start.** Before any step runs, the runner checks what would stop a pending step half-way
and refuses the whole run, changing nothing (ADR-IMPL-061). The log names each row, then:

```text
0035: airport XXX is off the globe (lat 999.000000, lng 500.000000): re-import it with its real coordinates
migration not started: nothing was changed. Fix the rows above, then run the migration again.
```

Re-import those airports with their real coordinates (the airports import), then run the same `deploy.sh` again.

**A database that ran 0034 before 0037.** 0034 kept, of each duplicate fare, the most recently updated copy, and
`expire-fares` updates a fare when it unpublishes it, so a route could lose its fare on sale to an expired copy
(ADR-IMPL-061). 0037 prevents it where 0034 has not run yet; where it already ran, the deleted rows are gone and
nothing tells which. To know which state a database is in:
`SELECT name, applied_at FROM platform.extras_applied WHERE name IN ('0034_catalog_fares_key.sql', '0037_catalog_fares_keep_live_copy.sql');`.
If 0034's `applied_at` is earlier than 0037's, import the catalogue again after the deploy: the import upserts on the
key and republishes each fare it carries.

**3. Data was lost or corrupted.** Restore, from the smallest scope that works:

- **One table, just after a deploy:** step 1/8 wrote `/var/backups/pre-deploy/<mode>-<timestamp>.dump`; files are kept 7 days. Restore that table into a scratch database, then copy the rows back:
  - `pg_restore -d scratch --data-only -t <table> <dump>`
  - then `INSERT … SELECT` across.
- **Everything, to a point in time:** use pgBackRest (§ Restore the database):
  - `bash infra/restore.sh --to-time "<just before the deploy>"`
  - The restore is drilled monthly by `infra/restore-test.sh` (cron `restore-test`, "restore drill ok" in `#bbc-ops`).
  - RPO ≈ 5 min: anything written after the chosen time is gone. Prefer the two options above when only one table is affected.

**4. An INVALID index after a failed `CREATE INDEX CONCURRENTLY`.** The CONCURRENTLY files (0012, 0013, 0017) run outside a transaction, so a failed build is not rolled back. It leaves an index that exists but is INVALID: never used by queries, but still maintained on every write.

The trap: those files say `IF NOT EXISTS`, so a plain re-run skips the invalid index and records the file as applied. Always drop the invalid index first:

```sql
SELECT n.nspname || '.' || c.relname AS index
FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT i.indisvalid;

DROP INDEX CONCURRENTLY IF EXISTS <schema>.<index>;
-- only if the file was already recorded as applied:
DELETE FROM platform.extras_applied WHERE name = '<NNNN_file.sql>';
```

Then run `db:migrate` again (or the deploy): the build starts over.

## Rotate a secret

```bash
bash infra/rotate-secret.sh production INTERNAL_API_SECRET             # both values accepted
# update CRM / marketing / CI, then:
bash infra/rotate-secret.sh production INTERNAL_API_SECRET --promote
docker compose ... up -d api
```

Staging has no rotation window: its secret is `INTERNAL_API_SECRET_STAGING` in `staging.env` (`compose.staging.yml` hands it to staging's API, worker and cron). Write a new one there (`openssl rand -base64 48`), then deploy staging; `rotate-secret.sh staging INTERNAL_API_SECRET` says so and stops.

`BETTER_AUTH_SECRET` rotation invalidates every session — announce it; do it only after an incident.

## APNs key revoked / push failing

Symptoms: `deliveries_dead` climbing, `notification.failed` with `InvalidProviderToken`.

1. Generate a new `.p8` in the Apple Developer account (Keys → APNs).
2. `base64 -w0 AuthKey_XXXX.p8` → `APNS_P8_BASE64` in the env file, update `APNS_KEY_ID`.
3. `docker compose ... up -d api`, then replay the dead deliveries.
   Inbox rows already exist, so nothing is lost — pushes are late, not missing.

Day-to-day states, sandbox versus production, and how to replay one failed row are under **Push**.

## Push

Keys live in env, base64-encoded. Nothing in the repo is a `.p8` or a Firebase service-account JSON.

| Name                         | What it is                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUSH_ADAPTER`               | `recording` (default) stores nothing with Apple or Google. `live` requires the FCM JSON; the APNs keys come all together or not at all. Without them push is live on Android only: the API logs it at boot, and an iPhone notification is marked `failed` (`Fatal`) while its token stays. Production may boot on `recording`; it logs one warning and `push_live` is 0 until you switch. |
| `APNS_P8_BASE64`             | Base64 of the `.p8` from Apple Developer → Keys.                                                                                                                                                                                                                                                                                                                                          |
| `APNS_KEY_ID`                | The key id of that `.p8`.                                                                                                                                                                                                                                                                                                                                                                 |
| `APNS_TEAM_ID`               | Apple team id.                                                                                                                                                                                                                                                                                                                                                                            |
| `APNS_BUNDLE_ID`             | `com.buybusinessclass.club`.                                                                                                                                                                                                                                                                                                                                                              |
| `APNS_ENVIRONMENT`           | `sandbox` for a development or TestFlight build that uses the sandbox gateway. `production` for an App Store build. A sandbox token sent to the production gateway is rejected, and the reverse is too.                                                                                                                                                                                   |
| `FCM_SERVICE_ACCOUNT_BASE64` | Base64 of the Firebase service-account JSON.                                                                                                                                                                                                                                                                                                                                              |

Rotate the APNs key the same way as the incident above: new `.p8`, new `APNS_P8_BASE64` and `APNS_KEY_ID`, restart the API. The old key stops working as soon as Apple revokes it, so put the new values in env before you revoke.

`notifications.notifications.status`:

| Status       | Meaning                                                                                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`    | Due, not claimed.                                                                                                                                                                                                                                                                             |
| `sending`    | Claimed. The provider call is in flight, or the process died after the claim. After 5 minutes the next dispatch adds 1 to `attempts` and returns the row to `pending`, or marks it `failed` once `attempts` reaches 6. The collapse id is the notification id, so the phone shows one banner. |
| `sent`       | No active device. The inbox row stays; there was nothing to push.                                                                                                                                                                                                                             |
| `delivered`  | At least one token was accepted.                                                                                                                                                                                                                                                              |
| `failed`     | Every token failed, or a `RateLimited` / `Transient` error has already been tried 6 times.                                                                                                                                                                                                    |
| `suppressed` | The member is not active, or an offer preference is off. A transactional quote-ready row is never suppressed by offer preferences.                                                                                                                                                            |

Replay one `failed` row (the next dispatch sends it):

```sql
UPDATE notifications.notifications
SET status = 'pending', claimed_at = NULL, scheduled_for = now(), last_error = NULL
WHERE id = '<uuid>' AND status = 'failed';
```

Staging boots with `PUSH_ADAPTER=recording`. Turn on email CRM first. The phone proof is later: set `PUSH_ADAPTER=live` and the keys above, then mark a request quoted. `live` without the FCM JSON, or with only some of the APNs keys, refuses to boot, and deploy.sh says so at step 2, before anything restarts. An Android phone gets a push token only from a build that carries Firebase's `google-services.json` (`GOOGLE_SERVICES_JSON`, docs/release.md).

## Campaigns

A broadcast offer does not create notifications inside its `offer.published` delivery. The delivery writes one row to `notifications.campaigns` and nothing else; the `campaign-fanout` job (every minute, singleton, 55 s) pages through the audience, 1 000 members per transaction, and writes the rows the **Push** section describes.

```sql
SELECT id, offer_id, status, last_member_id, created_at, finished_at
FROM notifications.campaigns ORDER BY created_at DESC LIMIT 10;
```

| Status       | Meaning                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pending`    | Recorded by the delivery; no page written yet.                                                                                                                                                                                       |
| `running`    | At least one page claimed. `last_member_id` is the last member of the last **committed** page — the next run starts after it. A run that crashed or hit its 55 s timeout stays here.                                                 |
| `done`       | The audience was exhausted; `finished_at` is set (a CHECK keeps the two in step) and `last_member_id` is cleared, so a finished campaign holds no member id.                                                                         |
| `done` early | The offer was withdrawn or expired: `offer.withdrawn` / `offer.expired` close its open campaign, and a running fan-out stops at its next page (each page locks the campaign and re-reads it). Rows already written are `suppressed`. |

**Resume a stuck campaign.** Nothing to reset: a `running` campaign is picked up again by the next run, after `last_member_id`. To push it now instead of waiting a minute:

```bash
docker compose ... exec -T cron /bin/sh /etc/cron/job.sh campaign-fanout
```

The job returns `{ campaigns, pages, inserted, capped }` in `platform.job_runs.metrics`. If one campaign fails on every run, it blocks the ones behind it (oldest first); read the error in `platform.job_runs`, fix the cause, and it continues where it stopped.

**Why it is idempotent.**

- `source_event_id` is UNIQUE: a re-delivered `offer.published` cannot start a second campaign.
- A page, its notifications and the new `last_member_id` commit together, so a crash never leaves a page half-counted.
- The notifications themselves are UNIQUE on (member, offer, category), and the insert is `ON CONFLICT DO NOTHING` — running the same page twice writes nothing twice.

**The daily cap** is one offer push per member per **server** day (`date_trunc('day', now())`, UTC on the host), not the member's local day. It is one query per page, not one per member.

## Postmark down / OTP not arriving

**What shows it.** Every code mail that fails leaves, on the API replica that tried it:

- one JSON log line `otp send failed` at level error, with `purpose` (`sign-in`, `forget-password`, `email-verification`), `reason` (`inactive_recipient` · `timeout` · `provider_error`), Postmark's HTTP `status` and `postmarkErrorCode` — never the address or the code;
- the counter `bbc_otp_send_failed{purpose,reason}` on that replica's `/metrics`, beside `bbc_otp_sent{purpose}` for the mails Postmark accepted (failed ÷ sent is the failure ratio);
- the first failure in each 5 minutes posts `[bbc identity] otp send failed: purpose=… reason=… status=…` to `OPS_WEBHOOK`, with how many more failed since the last post (counters are per process, like every request counter here).

**What members see.** Join and Sign in by code: `503 EMAIL_UNDELIVERABLE` "We couldn't send a code to that address. Check it, or try again in a moment." A reset (Forgot password?) or a verification code always answers 200 — by design, so the answer never tells whether an address has an account (ADR-PROD-001): a member who asked for a reset code may simply not get one, and only the log line and the counter know.

**What to do, by `reason`:**

1. `inactive_recipient` (Postmark 422 with `ErrorCode` 406): Postmark has suppressed that address after a hard bounce or a spam complaint. Find it in Postmark → the server → Activity (search by address when the member names it) and reactivate it under Suppressions only if the member confirms the address is right.
2. `timeout` (no answer within 4 s) or `provider_error` with status 5xx: Postmark is slow or down — check status.postmarkapp.com. Members can retry; a failed send releases the 30-second resend lock.
3. `provider_error` with status 401: `POSTMARK_SERVER_TOKEN` is wrong or was rotated — every code fails. Fix the token in the env file and restart the API. Other 422 codes (sender signature, message stream) are configuration: read `postmarkErrorCode` against Postmark's API error codes.

There is no second email provider: nothing reads `EMAIL_ADAPTER` and no SES sender exists. Existing sessions (30 days) keep working; only Join, sign-in by code and resets are blocked while Postmark refuses.

## Disk filling up (alert at 70 %)

```bash
df -h /; docker system df
docker image prune -f; docker builder prune -af
# `-af` would delete the previous release image that `deploy.sh` needs for rollback.
docker compose ... exec -T postgres psql -U bbc -d bbc -c "SELECT platform.drop_old_event_partitions(24);"
```

Every deploy removes old API images itself (step 8): it keeps the image it deployed, the one it replaced, the other environment's and the five newest, so a rollback always finds its image. Log rotation is configured (10 MB × 5 per service); if a service escapes it, that is the bug.

## Certificates

Cloudflare sits in front on "Full (strict)" and 80/443 answer Cloudflare only, so a public CA cannot always reach this box to validate a certificate. With `ORIGIN_TLS=on`, Caddy serves a **Cloudflare Origin CA** certificate instead and asks no CA for one. Cloudflare trusts it; a browser going straight to the box would not, which is the point.

**Install it once** (it lasts up to 15 years):

1. Cloudflare → SSL/TLS → Origin Server → Create Certificate: ECC, the hostnames `api.buybusinessclass.com` and `api-staging.buybusinessclass.com` (or `*.buybusinessclass.com`), PEM.
2. On the box, outside git (paste each block, then Ctrl-D):
   ```bash
   install -d -m 700 /etc/bbc/origin
   install -m 644 /dev/stdin /etc/bbc/origin/cert.pem
   install -m 600 /dev/stdin /etc/bbc/origin/key.pem
   ```
3. `ORIGIN_TLS=on` in `production.env`, any comment on its own line (`ORIGIN_CERT_DIR` only if the files live elsewhere).
4. Check it, then give Caddy the new setting (a new container: a few seconds without traffic):
   ```bash
   source infra/env-value.sh && origin_tls_check infra/env/production.env infra/env/staging.env && echo ok
   docker compose ... run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
   docker compose ... up -d --no-deps caddy
   ```

bootstrap.sh and deploy.sh run the same check before they change anything: both files there, the key readable by its owner only and matching the certificate, not expired, both domains named. Under 30 days left is a ⚠ line, not a stop, so a rollback still runs. **Renew** from the same Cloudflare page, replace the two files, run the check, then `docker compose ... exec caddy caddy reload --config /etc/caddy/Caddyfile --force` (graceful; without `--force` an unchanged Caddyfile is not reloaded and the old certificate stays). Back to Caddy's own certificates: `ORIGIN_TLS=off`, nothing after it on that line, then the three commands of step 4.

**With `ORIGIN_TLS=off`** Caddy renews its own certificates. If a domain shows an expired certificate: `docker compose ... logs caddy --tail 50`, check DNS points at this host, check ports 80/443 reach the machine (Cloudflare orange cloud + "Full (strict)").

## Memory and replicas

The memory limits in `docker-compose.yml` add up to 6.75 GB of the 8 GB box (the sum is at the top of that file): production 3.8 GB, staging 2 GB, Uptime Kuma 128 MB, the monitoring 736 MB (ADR-IMPL-073). A deploy adds N API replicas for a few minutes (1 GB at N = 2). MinIO (256 MB, `MEDIA=on`, with R1b), GlitchTip (1.6 GB) and Redis + Kafka (1.3 GB) are off unless asked for — each needs that sum looked at again first. When the box runs short anyway, the kernel kills staging first (`oom_score_adj` 500) and Postgres last (-500).

Staging's API replicas and its worker have 384 MB each and its Postgres 768 MB. If Grafana's memory panel shows one of them above 80 % of its limit, give it back in `staging.env` — `API_MEMORY_STAGING=512m`, `WORKER_MEMORY_STAGING=512m` or `POSTGRES_MEMORY_STAGING=1g` — with the sum above in view; the next staging deploy applies it (Postgres only when it is recreated, as below).

`API_REPLICAS` and `API_REPLICAS_STAGING` (default 2 each) set the number of API containers; `API_MEMORY`, `WORKER_MEMORY` and `POSTGRES_MEMORY` move a limit. A new value applies to a new container: the next deploy for the API and the worker. A deploy never recreates Postgres, so a new `POSTGRES_MEMORY`, or any change to the `postgres` service in `docker-compose.yml`, waits for `docker compose ... up -d --no-deps postgres` (and `postgres-staging` with the staging files), which restarts it — 10 to 60 seconds of errors, in a quiet minute.

## GlitchTip (off until I2)

Its four containers (1.6 GB) start only with `GLITCHTIP=on` in `production.env`; bootstrap.sh then also requires `GLITCHTIP_DB_PASSWORD`, `GLITCHTIP_SECRET` and `ERRORS_DOMAIN`. Nothing sends it errors yet. To stop the containers an earlier bootstrap started, keeping their data (`glitchtip_pg`):

```bash
docker compose ... --profile glitchtip stop redis glitchtip glitchtip-worker glitchtip-postgres
docker compose ... --profile glitchtip rm -f redis glitchtip glitchtip-worker glitchtip-postgres
```

## Monitoring (ADR-IMPL-073)

Metrics only: VictoriaMetrics scrapes each API replica and each worker, production's and staging's, the host (node-exporter) and every container (cAdvisor) each 30 s and keeps 90 days (`vm_data`, about 1–2 GB); Grafana shows three dashboards — the third read from production's Postgres itself, as `bbc_monitor` (ADR-IMPL-077) — and sends five alerts to `GRAFANA_ALERTS_WEBHOOK`. Logs and traces wait for staging's own machine. Four containers, 736 MB of limits (VictoriaMetrics 192, Grafana 384, cAdvisor 128, node-exporter 32), all on the internal network; only Grafana is published, on the box's loopback. Production reads `infra/monitoring` from this checkout, as it reads `infra/caddy`: a staging dispatch whose copy is not `origin/main`'s stops (§ Staging on the same box). The commands below use `$DC` from § Daily shape.

**Turn it on (once).**

1. Make room: MinIO is off until R1b (`MEDIA=off`), but a container an earlier bootstrap started is still there. Stop it; its data stays in `minio_data`:
   ```bash
   $DC --profile media stop minio && $DC --profile media rm -f minio
   ```
2. In `production.env`: `MONITORING=on`, `GRAFANA_ADMIN_PASSWORD=` (`openssl rand -base64 24`, into the password manager), `GRAFANA_ALERTS_WEBHOOK=` (where the alerts go; usually `OPS_WEBHOOK`'s URL) and `GRAFANA_PG_PASSWORD=` (`openssl rand -base64 24`: the database dashboard's read-only role; each production deploy gives it to `bbc_monitor`, step 8) — bootstrap.sh and deploy.sh refuse `MONITORING=on` without all three. Until the first production deploy after it is set, `the database` answers `password authentication failed`. `staging.env` sets neither: the deploy refuses there every name production's compose file substitutes (§ Staging on the same box), and its own `OPS_WEBHOOK` stays its own.
3. The next production deploy starts it (step 8). Or now: `$DC --profile monitoring up -d --no-deps victoriametrics grafana node-exporter cadvisor`.
4. Plans per statement need `pg_stat_statements.track_planning`, which Postgres takes when it is recreated: `$DC up -d --no-deps postgres`, in a quiet minute (§ Memory and replicas). Until then that panel reads 0. The same recreate brings ADR-IMPL-077's settings: `auto_explain` loaded but off (§ Tuning a statement), errors without their DETAIL (`log_error_verbosity=terse`), `jit=off`, `track_io_timing`, and statements over 250 ms in the log without their bound values (`$DC logs postgres --since 1h | grep duration`).

**Look.** `ssh -L 3000:127.0.0.1:3000 root@<host>`, then http://localhost:3000, user `admin`. Folder `BBC Club`: `the box` (CPU and memory by container against its limit, throttling, the host, Postgres connections, PgBouncer, network, kills for memory) and `the app` (the club's requests and p95/p99 by route — the probes and the cron's job runs left out — errors, API CPU per request, event-loop delay, statements per request, plans per statement, PgBouncer parses and binds, cache hit ratio, the queue, failed jobs). The `env` variable switches production and staging. `the database` (production only, ADR-IMPL-077): the slowest statements by total time, the indexes never read (a candidate to drop only after two weeks of real members, and through a PR: `db:verify`'s `NO_INDEX_NEEDED` lists the known ones), dead rows and when autovacuum last ran, the share of updates that stayed HOT, the largest tables, the statements that spill to disk. The dashboards and alerts are files in `infra/monitoring/grafana`: a change is a PR, never an edit in the UI (the UI refuses).

**The five alerts** (to `GRAFANA_ALERTS_WEBHOOK`; the worker sends its own two to `OPS_WEBHOOK`, § Database health):

| Alert                                                                                                | When   | First move                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A container is above 90 % of its memory limit                                                        | 5 min  | The memory panel: which one. Staging: give it back (§ Memory and replicas). Production: the API or the worker — look for a leak before raising it                                                                                 |
| The VPS steals more than 20 % of the CPU                                                             | 10 min | Not ours to fix: the hypervisor. If it lasts, ask Hostinger, or a larger plan                                                                                                                                                     |
| No push dispatch has finished in 10 minutes, the worker answering                                    | 5 min  | § The queue is stuck, then § Push. A killed `notifications` module stops the job too: then it is expected                                                                                                                         |
| An API replica or the worker that answered in the last day does not answer /metrics                  | 5 min  | `$DC ps`; § Roll back right now. It sees a replica that hangs and a worker that is gone; a replica that crashed restarts by itself and leaves no target (`Killed for memory` and `$DC ps` show it). Uptime Kuma watches the whole |
| More than 2 % of production's requests fail with a 5xx (the probes and the cron's job runs left out) | 10 min | `$DC logs api --tail 200`; § Roll back right now                                                                                                                                                                                  |

The three on production look only at what production has run: on a box that runs staging alone, before production's first deploy, they stay quiet.

**Its own cost.** Grafana has 384 MB, under the 512 MB Grafana 13 documents as its minimum: it fits with Prometheus as its only data source plugin. If its line on `Memory against the limit` stays high (the 90 % alert names it), give it `512m` in `docker-compose.yml`, by PR, with the sum in § Memory and replicas in view. Each of the four has a CPU limit, 1.3 cores in all. cAdvisor is the heaviest for its size, capped at 0.2 of a core: watch its CPU and throttling on `the box`. If it sits at its cap for a day, slow it down by a PR (`--housekeeping_interval=60s` in `docker-compose.yml`): stopping it lasts only until the next production deploy starts it again.

**Changing it.** VictoriaMetrics reads the scrape file again within a minute of a deploy, Grafana the dashboards each minute. Grafana reads its datasource, contact point and alerts only when it starts: `$DC --profile monitoring restart grafana`. `GRAFANA_ADMIN_PASSWORD` counts only while `grafana_data` is new; to change the password later, `read -rs P && $DC --profile monitoring exec grafana grafana cli admin reset-admin-password "$P"; unset P`, then the same value in `production.env` and the password manager.

**Turn it off.** `MONITORING=off`, then `$DC --profile monitoring stop victoriametrics grafana node-exporter cadvisor` and `rm -f` the same four; `vm_data` and `grafana_data` stay until you remove the volumes.

## "Vladimir is unavailable"

Everything above is runnable by anyone with SSH. Credentials are in the company password manager (Dan has access): SSH key, env files, backup encryption key, GHCR token, Apple/Google accounts.
**If the API is down and nothing above helps:** `docker compose ... restart api`; if that fails, deploy the last known good SHA from `#bbc-ops` history. Data is safe — backups are off-machine and encrypted.

---

## Rate limiting

The API counts with GCRA. Reads stay in process memory and fail open, so a home refresh never writes Postgres and a memory miss still serves the page. Submits, profile writes, device registration, and operator links use Postgres and fail closed: if that store errors, the route is 503, not unlimited.

| Rule                 | Store    | Limit | Period | Burst | On store error |
| -------------------- | -------- | ----- | ------ | ----- | -------------- |
| `read`               | memory   | 120   | 1 min  | 60    | allow          |
| `search`             | memory   | 60    | 1 min  | 20    | allow          |
| `anon`               | memory   | 300   | 1 min  | 100   | allow          |
| `requests.submit`    | postgres | 10    | 1 hour | 5     | 503            |
| `requests.submit.ip` | postgres | 60    | 1 hour | 20    | 503            |
| `profile.write`      | postgres | 30    | 1 hour | 10    | 503            |
| `devices.register`   | postgres | 20    | 1 hour | 5     | 503            |
| `ops.link`           | postgres | 30    | 1 min  | 10    | 503            |

Override without a deploy: a flag row `ratelimit.<rule>` whose JSON is `{ "limit": 10, "periodMs": 3600000, "burst": 5 }`. The process reads it from the flag cache. Denials increment `rate_limited_total{rule}`.

Nothing in the app depends on the edge rule below. It is a second lock in front of the origin, and it is not applied yet.

- STATUS: pending — needs someone with access to the zone
- Free-plan limits (1 rule, Path only, count by IP, 10 s period, 10 s mitigation)
- Rule `bbc-api-flood`: path starts with `/v1/` or `/api/auth/`, 1000 req / 10 s / IP, action **Block 10 s** — never Challenge
- PR body _Needs an owner_: which plan is the zone on; does the owner apply the rule or issue a WAF-edit token for this zone

---

## The origin is reachable only through Cloudflare

Docker publishes Caddy on 80/443. Those ports are filtered via a dedicated **`BBC-CF-WEB`** / **`BBC-CF-WEB6`**
chain jumped from `DOCKER-USER` (not by a blanket `ufw allow 443`), using `infra/cloudflare-ranges.txt`.
Refresh ranges with `bun run cf:gen`, commit, deploy, then re-run step 5b from `infra/bootstrap.sh` on the host
(first deploy of this firewall change: re-run bootstrap or 5b once so any leftover `ufw allow 80/443` is deleted
and `netfilter-persistent` saves the new chains).

Step 5b matches Cloudflare CIDRs on 80/443 **before** `RELATED,ESTABLISHED`, then DROPs everything else on those
ports — so a direct-to-origin TCP session already tracked when you re-run 5b is cut on the next packet.
Cloudflare keep-alives still match a CIDR and continue.

**Check how 443 is bound (IPv4 vs IPv6):**

```bash
ss -ltnp | grep :443
```

If you see `*:443` / `0.0.0.0:443` only, Cloudflare must use the A record. If you also see `[::]:443` and the
origin has an AAAA, traffic can hit ufw — bootstrap therefore `ufw allow`s Cloudflare’s **IPv6** CIDRs on 80/443.
Prefer dropping the AAAA if you do not need IPv6 to the origin.

**Direct-to-origin must fail** (from a machine that is not Cloudflare), on both families:

```bash
# IPv4 — replace <origin-v4> with the host A record
curl -v --resolve api.buybusinessclass.club:443:<origin-v4> https://api.buybusinessclass.club/health
# IPv6 — only if an AAAA exists; replace <origin-v6>
curl -v --resolve api.buybusinessclass.club:443:<origin-v6> https://api.buybusinessclass.club/health
```

Expect timeout / connection refused / TLS failure — never a 200. Through the orange-cloud hostname it must be 200.

### Authenticated Origin Pulls (second lock)

Order matters — reverse it and every request fails:

1. Cloudflare dashboard → SSL/TLS → Origin Server → **Authenticated Origin Pulls** = ON for the zone.
2. Open a **small PR** that copies the `client_auth { … }` block from
   `infra/caddy/origin-pulls.caddy.example` into `infra/caddy/origin-pulls.caddy`, merge, deploy. The Caddyfile reads
   that file inside each site's one `tls` block, with `ORIGIN_TLS` on or off; CI validates both.

Do **not** edit `origin-pulls.caddy` on the server. The live file is mounted from git; the next deploy would
overwrite a hand edit (protection disappears silently) or fail on conflict. Keep the CA at
`infra/caddy/cloudflare-origin-pull-ca.pem` (already mounted). After the PR deploys, `curl` to the origin IP
without Cloudflare’s client cert must fail the TLS handshake.

---

## First-day checklist on a new machine

0. Publish an API image first. `production.env.example` ships `API_IMAGE=…:REPLACE_WITH_SHA` and bootstrap
   starts Compose, so a placeholder tag makes the first pull fail. Either run the deploy workflow once to
   push a SHA-tagged image and set `API_IMAGE` to it, or build on the host:
   `docker build -f apps/api/Dockerfile -t ghcr.io/nasalciuc/bbc-api:$(git rev-parse --short HEAD) .`
1. Bootstrap from a **pinned commit**, never from `main` — piping a mutable branch into `sudo bash` runs
   whatever is on it at that moment:
   ```bash
   SHA=<the reviewed commit sha>
   BASE=https://raw.githubusercontent.com/Nasalciuc/BBC-Club/$SHA/infra
   curl -fsSL "$BASE/bootstrap.sh" -o /tmp/bootstrap.sh
   sha256sum /tmp/bootstrap.sh    # compare with the checksum in the PR / release notes
   sudo bash /tmp/bootstrap.sh production
   ```
2. Fill `infra/env/<mode>.env`, re-run the script (bootstrap runs migrations once Postgres is ready)
3. Point DNS at the host (Cloudflare, proxied). With `ORIGIN_TLS=on` the certificate is already in place
   (§ Certificates); otherwise wait for Caddy to get one
4. Production only: `bash infra/pgbackrest-init.sh`
5. `bash infra/restore-test.sh` — **before any real data exists**
6. Add the Uptime Kuma monitors: `/health` (1 min), `/status` (5 min), and an external ping from a free service
7. Store every secret in the password manager

## Staging on the same box

`bash infra/deploy.sh staging <image>` — separate database, separate secrets (`infra/env/staging.env`), same Caddy (second domain). Move it to its own machine at the first real offer (ADR-IMPL-010 §7).

Every deploy passes both env files to Compose, `staging.env` last, so for any `${KEY}` in `docker-compose.yml` staging's value would replace production's. `staging.env` therefore holds staging's own settings only, under names production never reads (`INTERNAL_API_SECRET_STAGING`, `POSTGRES_PASSWORD_STAGING`, `API_IMAGE_STAGING`); deploy.sh refuses anything else by name before step 1, and bootstrap.sh with its other env checks, before it starts anything. A setting both environments need, like the domains or `ORIGIN_TLS`, lives in `production.env`.

The box has one checkout, and production's long-running containers read files from it: Caddy its Caddyfile and `/.well-known` files (`infra/caddy`, the files at once, the config at its next reload or restart), the monitoring its scrape targets and dashboards (`infra/monitoring`, within a minute), cron its crontab at its next start (`infra/cron`). So the `api-deploy` workflow refuses a staging dispatch whose `infra/caddy` or `infra/monitoring` is not `origin/main`'s: such a branch reaches staging after its merge. A branch's `infra/cron` reaches production's cron only if cron restarts while the checkout is on that branch; the next production deploy recreates cron from its own commit.

## Load tests on staging

`docs/perf/LOADTEST.md`: Grafana Cloud k6 against `api-staging`, with accounts made by `scripts/loadtest-staging.ts start`
and removed by `stop`. A step test shares the box with production: a quiet hour.

## Staging demo data (ADR-IMPL-040)

On staging the review account (`REVIEW_ACCOUNT_EMAIL` / `REVIEW_ACCOUNT_PASSWORD` in `staging.env`) is Figma's member: Alex Morgan, home JFK, the pins with their fares, the three offers, a request in each state, the inbox. Every date is counted from the day the script runs, so nothing in a demo is in the past. `deploy.sh staging` refreshes it at step 7 — a deploy is the only thing that changes the server, and the refresh is one more line in its log. Between deploys, or after a demo that changed things (a read inbox item, a request made, an offer tapped, saved preferences, another home airport, a changed password — all undone), run it by hand:

```bash
cd /opt/bbc/infra && docker compose -f docker-compose.yml -f compose.prod.yml -f compose.staging.yml --env-file env/production.env --env-file env/staging.env \
  run --rm --no-deps -e DB_POOLER=none -e DATABASE_URL="postgres://bbc:${POSTGRES_PASSWORD_STAGING}@postgres-staging:5432/bbc" api-staging bun run scripts/seed-staging-demo.ts
```

It prints `staging demo ready — … dates from <today>`. It refuses any database that is not staging's (`postgres-staging` / `pgbouncer-staging`): pointed at production it stops before writing. The poster route JFK → ZRH is left without a fare on purpose, so the estimate (ADR-IMPL-037) can be shown there once `catalog.estimates` is on and the rules are loaded.

**Once the site's deals are on in staging (`catalog.site_offers`, ADR-IMPL-067)** the demo's two broadcast offers — Paris
and Tokyo, seen by every staging member — should not be what members see: withdraw them once, as the internal route
does it (status `withdrawn` and `offer.withdrawn`, so pending pushes are suppressed). The demo seed keeps a withdrawn
demo offer withdrawn at every later deploy and writes no inbox item for it; London, the review account's own, stays.

```bash
# staging: the two ids, then the withdraw route through the staging worker (the secret is read from its environment)
docker exec -it bbc-postgres-staging-1 psql -U bbc -d bbc -Atc \
  "SELECT id FROM proposals.offers WHERE idempotency_key IN ('staging-demo:paris','staging-demo:tokyo') AND status = 'active'"
for id in <id-1> <id-2>; do
  docker exec -i "$(docker ps -qf name=bbc-worker-staging | head -1)" \
    bun -e "fetch('http://localhost:8001/v1/internal/offers/$id/withdraw',{method:'POST',headers:{'X-Internal-Secret':process.env.INTERNAL_API_SECRET,'Content-Type':'application/json'},body:JSON.stringify({reason:'site deals on'})}).then(async r=>console.log(r.status,await r.text()))"
done
```

Each answers `200 {"ok":true}`. To bring them back (the deals off again), set their `status` to `active` in
`proposals.offers` and run the demo seed: it dates them from today.

## Redis, Kafka, Streams, and demand

Unset `REDIS_URL` and `KAFKA_BROKERS` and the API stays on Postgres: flags, the airports and the catalogue's pins are held in each process and read again when their table's generation moves (within a second of any write, psql's included; ADR-IMPL-075), read and search rate limits use the in-process GCRA store, push dispatch sends inline, and search does not emit events. Kill switches and consumer pause come from the same snapshot and fail closed — killed, paused — when a process has not been able to read the flags for 10 s.

**Turn Redis on.** Set `REDIS_APP_PASSWORD` (Compose only) and `REDIS_URL=redis://:PASSWORD@redis-app:6379` on the api and worker. A password inside `REDIS_URL` must be URL-safe or percent-encoded. Read and search limits move to Redis and fall back to memory if Redis errors, so a down Redis does not 503 those routes. Postgres rules (writes, auth) do not move. Reference data stays in each process on Postgres's generations (ADR-IMPL-075): Redis adds nothing there.

**Turn Kafka on.** Set `KAFKA_BROKERS=kafka:9092`. The process registers consumer `platform.kafkaRelay` and publishes each committed journal event to `bbc.domain-events.v1`. Delivery is at-least-once. There is no per-aggregate order: a failed relay waits in backoff while a later event for the same aggregate can be published. Consumers must be idempotent and order-independent. A duplicate `topic:partition:offset` inserts nothing in `platform.kafka_processed` and has no second effect. The offset commits after that transaction.

**Push streams.** Flag `jobs.push.transport` defaults to `pg` (`scripts/seed-flags.ts`). Set the variant to `streams` only while Redis is up. Dispatch then enqueues claimed notification ids; the worker (any role except `api`) delivers rows still in `sending`. If the enqueue throws, dispatch sends inline. Flipping the flag back to `pg` stops new enqueues. The worker still finishes ids already in the stream. Row status is the duplicate guard.

**Demand.** Flag `catalog.search_events` defaults to off. When it is on, `GET /v1/search` only pushes onto a bounded buffer. A flusher publishes `bbc.search.v1`. The worker updates that UTC day's Top-K and Count-Min Sketches. `demand-rollup` (03:15 UTC) writes yesterday into `catalog.demand_daily`. Read it with the internal secret:

```bash
curl -sS -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  "https://<host>/v1/internal/demand?days=7"
```

Routes with no fare sort first. The payload has no member id, IP, or device id.

**Popular from <city>** (ADR-IMPL-039) reads the same table: a route shows from 5 searches in the last seven UTC days,
names only. With the flag off, or before the first rollup, members see the hubs and
`bbc_popular_destinations_shown{source="searches"}` stays at 0. After turning the flag on, the first searched routes
appear the morning after the first rollup (03:15 UTC), within the 5-minute cache.

**Failure.** Redis down: cache reads call the database, rate limits use memory, streams enqueue falls back to inline send, demand rollup writes nothing. Kafka down: the relay delivery retries; search latency does not change because the request never awaits the broker. A full search buffer drops the oldest event and increments `search_events_dropped`.

**Do not publish 6379 or 9092.** RedisInsight and kafka-ui are not services in Compose. If you need them, SSH-tunnel to the host and point them at the internal DNS names `redis-app` and `kafka`. The GlitchTip `redis` service is a different instance. Do not point the API at it.

## Images pinned by digest

MinIO runs Chainguard's build (`cgr.dev/chainguard/minio`), pinned by digest, because the free tier publishes only `latest`
and MinIO no longer publishes its own image. To take Chainguard's fixes:

1. `docker pull cgr.dev/chainguard/minio:latest && docker inspect --format '{{index .RepoDigests 0}}' cgr.dev/chainguard/minio:latest`
2. Replace the digest on the `minio` line of `infra/docker-compose.yml` in a PR; CI must pull it.
3. After merge, deploy as usual; `minio` is recreated with the same `minio_data` volume.
