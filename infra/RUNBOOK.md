# RUNBOOK — BBC Club infrastructure

Written for someone who has never seen this system. Every command is copy-paste. If a step needs judgement, it says so.

**Machine:** one EU VPS, `/opt/bbc`, Docker Compose (one project; staging = extra services `api-staging`/`postgres-staging` on the same box). **Only 22, 80, 443 are open.** Everything else (Postgres, MinIO, GlitchTip, Kuma) is reachable only through an SSH tunnel:

```bash
ssh -L 5432:localhost:5432 -L 3001:localhost:3001 root@<host>   # then connect to localhost
```

**Alerts:** `#bbc-ops` (disk, queue, failed jobs, crash-free, code mails that fail — "Postmark down / OTP not arriving") · `#bbc-sec` (5xx bursts, rate-limit anomalies, DLQ, failed restore) · phone escalation only for "API down > 5 min" from Uptime Kuma.

---

## Daily shape

```bash
cd /opt/bbc
DC="docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env"
$DC ps
$DC exec -T api bun -e "fetch('http://localhost:8000/status').then(r=>r.text()).then(t=>console.log(t))" | jq   # db, queue, staleJobs, failingJobs (503 when unwell)
$DC exec -T api bun -e "fetch('http://localhost:8000/metrics').then(r=>r.text()).then(t=>console.log(t))" | grep -E 'http_|queue_pending|queue_dead|queue_oldest'
$DC exec -T worker bun -e "fetch('http://localhost:8001/metrics').then(r=>r.text()).then(t=>console.log(t))" | grep -E 'db_|pgbouncer_'
```

Request counters on `/metrics` are **per Bun process**; `exec` asks the first API replica. Caddy answers 404 for `/metrics`, `/ready`, `/status` and `/worker-metrics` to every address but its own: closed from the internet, and to a `curl` on the box too, which reaches Caddy from Docker's bridge address. The commands above ask each process directly. `/ready` is that one process — not draining, its database answers — and is what deploys wait on; `/status` is the system — the queue (nothing pending over 5 minutes, no dead letter) and every scheduled job on time (`staleJobs`) and not failing (`failingJobs`: its last finished run failed; the next run that succeeds clears it) — and is what Uptime Kuma watches. A dead letter turns `/status` red and leaves `/ready` green, so the deploy that fixes it still rolls. Database gauges (`db_connections`, `db_oldest_tx_seconds`, `db_lock_waits`, `db_deadlocks_total`, `pgbouncer_waiting_clients`) are set by the worker job `db-observe`, so they are on the worker's `/metrics` (port 8001), the third command. Alerts POST from that process to `OPS_WEBHOOK`; there is no Prometheus. Per-IP read limits are in each process's memory: with N replicas a client can receive up to N × the limit until a shared store exists.

GlitchTip uses **its own Postgres** (`glitchtip-postgres`). It is not in the pgBackRest stanza.

## Deploy

```bash
flock /var/lock/bbc-deploy.lock bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<sha>      # staging: deploy.sh staging <image>
```

`LOADTEST=1` in production.env is refused. Image tags must be a commit SHA (`:latest` is rejected).

The `api-deploy` workflow holds `/var/lock/bbc-deploy.lock` from its `git checkout` to the end of the deploy, so two dispatches never swap the shared checkout under each other; its SSH step has an hour in all, up to 25 minutes of it waiting for the lock. By hand, `flock` (above) waits its turn the same way. A staging dispatch whose `infra/caddy` differs from `origin/main`'s stops before its checkout: production's Caddy reads that directory from this checkout (§ Staging on the same box).

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

There is no Prometheus or Alertmanager in this stack. Thresholds are evaluated by the worker and posted to `OPS_WEBHOOK`.

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

## Stop a runaway feature without deploying

```bash
docker compose ... exec -T postgres psql -U bbc -d bbc \
  -c "INSERT INTO platform.flags(key,value) VALUES ('personalization.killed','{\"enabled\":true}')
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();"
```

Modules: `proposals`, `engagement`, `notifications`, `personalization`, `members`. The app reads them from `/v1/app-config`; the API stops mounting the routes on next boot and pauses the consumers.

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

The poster check must equal the poster (JFK → ZRH, business, round trip). Searches use the new rules within ~35 s. Then
estimates on, in that environment's database (staging: `docker exec -it bbc-postgres-staging-1 psql -U bbc -d bbc`;
production only after the company's written approval). Off is the same with `false` (~35 s):

```sql
INSERT INTO platform.flags(key,value) VALUES ('catalog.estimates','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
```

With estimates on, a quote request whose app showed the estimate (A2c and later) carries it — stored on the request,
published with the rules' fingerprint and written into the specialist's e-mail as `Indicative estimate shown: $2,055
round trip, business (formula)` (ADR-IMPL-042). `catalog.estimates` off stops estimates everywhere; `catalog.killed`
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
Then it gives up: the log says `request send gave up` (with the request id), `bbc_request_sends_given_up` rises on the
worker's metrics, `OPS_WEBHOOK` gets one line, and the member reads `Not sent` — with a call button from the A2c app
on; older apps still say it is saved on the phone. Nothing resends it by itself. Fix the cause (the CRM, `OPERATORS_EMAIL`, Postmark — the log line has the error), then re-queue it; the next
minute's run sends it:

```sql
SELECT id, reference, send_attempts, last_error, created_at FROM requests.requests
WHERE sent_to_crm = false AND status <> 'closed' AND send_attempts >= 6 ORDER BY created_at;
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
image. Every city is looked at again after 30–33 days. Only addresses and credits are stored — never an image.

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
a month: `UPDATE catalog.place_photos SET expires_at = now() WHERE status = 'satellite';`.

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
carries the stage and the error — never the Pexels key. An error `place photos: Pexels refused PEXELS_API_KEY` (401)
means the key is wrong or revoked: until it is replaced, a city that shows a photo keeps it, and one Commons has no
photo for gets its satellite view, looked at again each day.

## Member photos (ADR-IMPL-070)

A member's own photo is in Postgres, `members.profile_photo`: one row per member, a 512 × 512 WebP of at most 100 KB
without metadata, served only to that member by `GET /v1/profile/photo` (no public address, nothing in MinIO). It goes
with the account (`member.deleted`, and the FK from the profile), so backups and the restore drill carry it like any
other row. Only a build from 0.3.0 shows the `Photo` row; an older build that took an update over the air shows none.

How many, and how much room they take:

```sql
SELECT count(*), pg_size_pretty(sum(byte_size)::bigint) AS bytes, max(byte_size) FROM members.profile_photo;
SELECT pg_size_pretty(pg_total_relation_size('members.profile_photo'));
```

A member asks for their photo to be removed and cannot do it in the app (Edit profile → Photo → Remove photo):
`DELETE FROM members.profile_photo WHERE member_id = '<member id>';` — their portrait shows their initials from the
next load. Never copy a photo out of the database to look at it.

## The site's destinations (ADR-IMPL-045)

Once a night (07:40 UTC, night in the US) `sync-site-destinations` (worker) reads the company's site through its own
API — `weba.buybusinessclass.com`: regions, their countries, their cities, about 240 pages, then a HEAD request for each
city's photo, four requests at a time — and keeps a snapshot: `catalog.site_places` (each city, its main airport, every
airport it covers, its photo's path) and `catalog.site_routes` (the US airports the site lists a price from, and that
price — kept, never shown). The site has no airport codes: a city is matched by name inside the country the site puts
it in; the few names that need help are listed in `SITE_CITY_AIRPORTS` (catalog `application/site-places.ts`). Two
flags, both seeded off; with both off the job asks the site nothing.

- `catalog.site_photos`: each city's own photo on all its airports, stored as an operator's photo (it never expires, has
  no credit line, and `resolve-place-photos` never touches it). An operator's own photo from anywhere else stays; one
  put by hand with an address on the site counts as the site's — the job takes it back while the photos are off, or
  its city is skipped. A city whose page shows another city's photo (Crete shows Santorini's) keeps Wikimedia's.
  `{"enabled":true,"skip":[23]}` keeps the cities listed (the site's ids: 23 is London) on Wikimedia. Off: the next
  run hands every site photo back to `resolve-place-photos`, which finds Wikimedia's again at ten airports a minute —
  about twenty minutes for all of them, the club's image meanwhile; off and `skip` work even on a night the site does
  not answer. An operator's `DELETE …/photo` on a site photo lasts until the next night: keep a city off with `skip`,
  or give it the club's own photo (`PUT …/photo` with an address elsewhere), which the job never touches. Members'
  phones load these photos from `weba.buybusinessclass.com`.
- `catalog.site_pins`: after the fares' pins, up to twelve of the site's cities listed from the member's home airport
  (the site's home page first, then the busiest), priced by the formula in the member's cabin (ADR-IMPL-037), so the
  pin, its search's estimate row and the quote show one number. Nothing while `catalog.estimates` is off: no price, no
  pin.

All or nothing: a region or a country that does not answer, fewer than 80 % of last night's cities listed or placed on
their airports, or more than 10 % (at least three) city pages unanswered, and the run fails and changes nothing:
`platform.job_runs` says `failed` and why, and the worker's `/metrics` counts it in
`bbc_job_failed{job="sync-site-destinations"}`, and `/status` turns red with the job in `failingJobs` until a run succeeds. A
single city page that does not answer keeps last night's rows; a photo the site cannot be asked about (no answer, a 5xx)
keeps last night's verdict. The run's counts are in `platform.job_runs`; the log lines `site: no airport`,
`site: main airport by a tie`, `site: borrowed photo`, `site: odd photo`, `site: photo does not answer`,
`site: photo not checked, kept`, `site: unknown US city` and `site: city page did not answer, kept` name the cities.
Kyoto is listed under `site: no airport` on purpose: it has no airport of its own, and Osaka's photo is Osaka's. A city
under `site: main airport by a tie` got the alphabetically first of its busiest airports: list it in
`SITE_CITY_AIRPORTS` (a PR), main airport first.

Before turning either on, see what the site holds today, with no database: `bun run scripts/site-destinations-report.ts`
on any computer with the repository reads the site as the job does (about 400 requests, a minute or two), prints a
summary and writes one HTML page in the temporary folder — every city with its photo, its airports, whether its photo
answers and how heavy it is (the app shows the site's file as is), and the site's prices.

Turn one on (or off) in that environment's database (staging:
`docker exec -it bbc-postgres-staging-1 psql -U bbc -d bbc`), wait a minute (a flag is read through a cache of about
35 s), then, on the server, run the job instead of waiting for the night — through the worker, so the secret is read
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

It answers `200` with the run: `"status":"succeeded"` and its counts under `metrics` (`read`, `cities`, `places`,
`photosSet`, …); `"failed"` changed nothing, and its `error` says why; `"skipped"` — a run was already going: try again
in two minutes.

What the snapshot holds:

```sql
SELECT cms_id, name, country, airport, airports, promoted, image IS NOT NULL AS photo FROM catalog.site_places ORDER BY name;
SELECT route_from, count(*) FROM catalog.site_routes GROUP BY route_from ORDER BY 2 DESC;
```

## The queue is stuck (oldest pending > 5 min)

1. `curl -s localhost:8000/metrics | grep queue_` — depth, age, dead.
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

The memory limits in `docker-compose.yml` add up to 6.9 GB of the 8 GB box (the sum is at the top of that file): production 4 GB, staging 2.7 GB, Uptime Kuma 128 MB. A deploy adds N API replicas for a few minutes (1 GB at N = 2). GlitchTip (1.6 GB) and Redis + Kafka (1.3 GB) are off unless asked for. When the box runs short anyway, the kernel kills staging first (`oom_score_adj` 500) and Postgres last (-500).

`API_REPLICAS` and `API_REPLICAS_STAGING` (default 2 each) set the number of API containers; `API_MEMORY`, `WORKER_MEMORY` and `POSTGRES_MEMORY` move a limit. A new value applies to a new container: the next deploy for the API and the worker. A deploy never recreates Postgres, so a new `POSTGRES_MEMORY`, or any change to the `postgres` service in `docker-compose.yml`, waits for `docker compose ... up -d --no-deps postgres` (and `postgres-staging` with the staging files), which restarts it — 10 to 60 seconds of errors, in a quiet minute.

## GlitchTip (off until I2)

Its four containers (1.6 GB) start only with `GLITCHTIP=on` in `production.env`; bootstrap.sh then also requires `GLITCHTIP_DB_PASSWORD`, `GLITCHTIP_SECRET` and `ERRORS_DOMAIN`. Nothing sends it errors yet. To stop the containers an earlier bootstrap started, keeping their data (`glitchtip_pg`):

```bash
docker compose ... --profile glitchtip stop redis glitchtip glitchtip-worker glitchtip-postgres
docker compose ... --profile glitchtip rm -f redis glitchtip glitchtip-worker glitchtip-postgres
```

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

The box has one checkout, and production's long-running containers read files from it: Caddy its Caddyfile and `/.well-known` files (`infra/caddy`, the files at once, the config at its next reload or restart), cron its crontab at its next start (`infra/cron`). So the `api-deploy` workflow refuses a staging dispatch whose `infra/caddy` is not `origin/main`'s: such a branch reaches staging after its merge. A branch's `infra/cron` reaches production's cron only if cron restarts while the checkout is on that branch; the next production deploy recreates cron from its own commit.

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

## Redis, Kafka, Streams, and demand

Unset `REDIS_URL` and `KAFKA_BROKERS` and the API stays on Postgres: flags cache in the process for 30 seconds, read and search rate limits use the in-process GCRA store, push dispatch sends inline, and search does not emit events. Kill switches and consumer pause always read Postgres and are never cached.

**Turn Redis on.** Set `REDIS_APP_PASSWORD` (Compose only) and `REDIS_URL=redis://:PASSWORD@redis-app:6379` on the api and worker. A password inside `REDIS_URL` must be URL-safe or percent-encoded. Read and search limits move to Redis and fall back to memory if Redis errors, so a down Redis does not 503 those routes. Postgres rules (writes, auth) do not move. Destinations and airports cache under a generation key; import and `expire-fares` bump it.

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
