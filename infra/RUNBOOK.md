# RUNBOOK — BBC Club infrastructure

Written for someone who has never seen this system. Every command is copy-paste. If a step needs judgement, it says so.

**Machine:** one EU VPS, `/opt/bbc`, Docker Compose (one project; staging = extra services `api-staging`/`postgres-staging` on the same box). **Only 22, 80, 443 are open.** Everything else (Postgres, MinIO, GlitchTip, Kuma) is reachable only through an SSH tunnel:

```bash
ssh -L 5432:localhost:5432 -L 3001:localhost:3001 root@<host>   # then connect to localhost
```

**Alerts:** `#bbc-ops` (disk, queue, failed jobs, crash-free) · `#bbc-sec` (5xx bursts, rate-limit anomalies, DLQ, failed restore) · phone escalation only for "API down > 5 min" from Uptime Kuma.

---

## Daily shape

```bash
cd /opt/bbc
docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env ps
curl -s localhost:8000/ready | jq        # db, queue, staleJobs — one replica (Caddy @ops)
curl -s localhost:8000/metrics | grep -E 'http_|queue_pending|queue_dead|queue_oldest'
curl -sS --resolve <API_DOMAIN>:443:127.0.0.1 https://<API_DOMAIN>/worker-metrics | grep -E 'db_|pgbouncer_'
docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env exec -T worker \
  bun -e "fetch('http://localhost:8001/metrics').then(r=>r.text()).then(t=>console.log(t))" | grep -E 'db_|pgbouncer_'
```

Request counters on `/metrics` are **per Bun process**. Caddy's `@ops` route (`/metrics` `/ready`) reaches one API replica on port 8000. Database gauges (`db_connections`, `db_oldest_tx_seconds`, `db_lock_waits`, `db_deadlocks_total`, `pgbouncer_waiting_clients`) are set by the worker job `db-observe`. Caddy serves them only on `/worker-metrics` (same localhost gate, upstream `worker:8001`). Alerts POST from that process to `OPS_WEBHOOK`; there is no Prometheus. Per-IP read limits are in each process's memory: with N replicas a client can receive up to N × the limit until a shared store exists.

GlitchTip uses **its own Postgres** (`glitchtip-postgres`). It is not in the pgBackRest stanza.

## Deploy

```bash
bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<sha>      # staging: deploy.sh staging <image>
```

`LOADTEST=1` in production.env is refused. Image tags must be a commit SHA (`:latest` is rejected).

Sequence: (1) `pg_dump` (2) pull API+worker images (3) migrate with a **direct** `DATABASE_URL` to Postgres — never PgBouncer (4) `up -d` the pooler (with its dependencies), then start **one** new replica and wait `CANARY_SECONDS` (600, or 120 on staging), then compare its `/metrics` with an old replica (`scripts/canary-compare.ts`): abort when `/ready` fails, when the 5xx ratio exceeds `max(1%, 2× old)`, or when p99 is two buckets worse; under 50 requests judge only `/ready` and zero 5xx (5) scale API to 2N, wait `/ready` on the other new containers, SIGTERM the old generation (drain: `/ready` 503 for 5 s then `server.stop(false)`), scale back to N (6) recreate the **single** worker (never two pollers), wait `/ready` on 8001, then force-recreate cron so `API_URL` is the worker (7) prune. `rollback_and_exit` restores the previous image tag and brings API+worker back. It reports that rollback only after `/ready` is green on every restored API replica, and on the worker at port 8001 when the previous image has one.

Compose healthcheck is `/health`; the deploy gate is `/ready`. Caddy `api_site` resolves replicas with `dynamic a` (refresh 5 s), `least_conn`, passive health on 5xx.

After `shared_preload_libraries=pg_stat_statements` changes, Postgres must restart once for the library to load; `CREATE EXTENSION` is migration `0020`.

## Roll back right now

```bash
bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<previous-sha>
```

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

**Weekly report** (job `db-report`, Mondays 09:00 UTC) and live `GET /v1/internal/db-report` (`ops:read`, operator JWT):

```bash
# worker directly (the route is on every role; the job that fills the report runs here)
docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env exec -T worker \
  bun -e "fetch('http://localhost:8001/v1/internal/db-report',{headers:{Authorization:'Bearer <operator-jwt>'}}).then(r=>r.text()).then(console.log)"

# through Caddy, which only serves api_site for the real host
curl -sS --resolve <API_DOMAIN>:443:127.0.0.1 -H "Authorization: Bearer <operator-jwt>" https://<API_DOMAIN>/v1/internal/db-report | jq
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

## Pause one event consumer (e.g. a handler writing bad data)

```sql
INSERT INTO platform.flags(key,value) VALUES ('consumer.crm.onOfferResponded.paused','{"enabled":true}')
ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
```

Deliveries queue up as `paused`; resume with the same flag `false`, then `poller.resume(consumer)` via `POST /v1/internal/run/queue-health`.

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

Never edit a migration that already ran.

**3. Data was lost or corrupted.** Restore, from the smallest scope that works:

- **One table, just after a deploy:** step 1/7 wrote `/var/backups/pre-deploy/<mode>-<timestamp>.dump`; files are kept 7 days. Restore that table into a scratch database, then copy the rows back:
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

| Name                         | What it is                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUSH_ADAPTER`               | `recording` (default) stores nothing with Apple or Google. `live` requires every APNs field and the FCM JSON. Production may boot on `recording`; it logs one warning and `push_live` is 0 until you switch. |
| `APNS_P8_BASE64`             | Base64 of the `.p8` from Apple Developer → Keys.                                                                                                                                                             |
| `APNS_KEY_ID`                | The key id of that `.p8`.                                                                                                                                                                                    |
| `APNS_TEAM_ID`               | Apple team id.                                                                                                                                                                                               |
| `APNS_BUNDLE_ID`             | `com.buybusinessclass.club`.                                                                                                                                                                                 |
| `APNS_ENVIRONMENT`           | `sandbox` for a development or TestFlight build that uses the sandbox gateway. `production` for an App Store build. A sandbox token sent to the production gateway is rejected, and the reverse is too.      |
| `FCM_SERVICE_ACCOUNT_BASE64` | Base64 of the Firebase service-account JSON.                                                                                                                                                                 |

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

Staging boots with `PUSH_ADAPTER=recording`. Turn on email CRM first. The phone proof is later: set `PUSH_ADAPTER=live` and the keys above, then mark a request quoted. `live` without those keys refuses to boot.

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
| `done`       | The audience was exhausted; `finished_at` is set (a CHECK keeps the two in step).                                                                                                                                                    |
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

1. Check bounce rate in Postmark; check `#bbc-ops` for the OTP sent/verified ratio.
2. Fallback: set `EMAIL_ADAPTER=ses` in the env file and restart the API.
3. Existing sessions (30 days) keep working; only new sign-ups and resets are blocked.

## Disk filling up (alert at 70 %)

```bash
df -h /; docker system df
docker image prune -f; docker builder prune -af
# `-af` would delete the previous release image that `deploy.sh` needs for rollback.
docker compose ... exec -T postgres psql -U bbc -d bbc -c "SELECT platform.drop_old_event_partitions(24);"
```

Log rotation is configured (10 MB × 5 per service); if a service escapes it, that is the bug.

## Certificate problems

Caddy renews automatically. If a domain shows an expired certificate: `docker compose ... logs caddy --tail 50`, check DNS points at this host, check ports 80/443 reach the machine (Cloudflare orange cloud + "Full (strict)").

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
2. Open a **small PR** that copies the `tls { client_auth … }` block from
   `infra/caddy/origin-pulls.caddy.example` into `infra/caddy/origin-pulls.caddy`, merge, deploy.

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
   (both require the assembled monorepo — see PLAN.md D2).
1. Bootstrap from a **pinned commit**, never from `main` — piping a mutable branch into `sudo bash` runs
   whatever is on it at that moment:
   ```bash
   SHA=<the reviewed commit sha>
   BASE=https://raw.githubusercontent.com/Nasalciuc/BBC-Club/$SHA/isolated/infra-production-v2/infra-v2/infra
   curl -fsSL "$BASE/bootstrap.sh" -o /tmp/bootstrap.sh
   sha256sum /tmp/bootstrap.sh    # compare with the checksum in the PR / release notes
   sudo bash /tmp/bootstrap.sh production
   ```
2. Fill `infra/env/<mode>.env`, re-run the script (bootstrap runs migrations once Postgres is ready)
3. Point DNS at the host; wait for Caddy to get a certificate
4. Production only: `bash infra/pgbackrest-init.sh`
5. `bash infra/restore-test.sh` — **before any real data exists**
6. Add the Uptime Kuma monitors: `/health` (1 min), `/ready` (5 min), and an external ping from a free service
7. Store every secret in the password manager

## Staging on the same box

`bash infra/deploy.sh staging <image>` — separate database, separate secrets (`infra/env/staging.env`), same Caddy (second domain). Move it to its own machine at the first real offer (ADR-IMPL-010 §7).

## Redis, Kafka, Streams, and demand

Unset `REDIS_URL` and `KAFKA_BROKERS` and the API stays on Postgres: flags cache in the process for 30 seconds, read and search rate limits use the in-process GCRA store, push dispatch sends inline, and search does not emit events. Kill switches and consumer pause always read Postgres and are never cached.

**Turn Redis on.** Set `REDIS_APP_PASSWORD` (Compose only) and `REDIS_URL=redis://:PASSWORD@redis-app:6379` on the api and worker. Read and search limits move to Redis and fall back to memory if Redis errors, so a down Redis does not 503 those routes. Postgres rules (writes, auth) do not move. Destinations and airports cache under a generation key; import and `expire-fares` bump it.

**Turn Kafka on.** Set `KAFKA_BROKERS=kafka:9092`. The process registers consumer `platform.kafkaRelay` and publishes each committed journal event to `bbc.domain-events.v1`. Delivery is at-least-once. There is no per-aggregate order: a failed relay waits in backoff while a later event for the same aggregate can be published. Consumers must be idempotent and order-independent. A duplicate `topic:partition:offset` inserts nothing in `platform.kafka_processed` and has no second effect. The offset commits after that transaction.

**Push streams.** Flag `jobs.push.transport` defaults to `pg` (`scripts/seed-flags.ts`). Set the variant to `streams` only while Redis is up. Dispatch then enqueues claimed notification ids; the worker (any role except `api`) delivers rows still in `sending`. If the enqueue throws, dispatch sends inline. Flipping the flag back to `pg` stops new enqueues. The worker still finishes ids already in the stream. Row status is the duplicate guard.

**Demand.** Flag `catalog.search_events` defaults to off. When it is on, `GET /v1/search` only pushes onto a bounded buffer. A flusher publishes `bbc.search.v1`. The worker updates that UTC day's Top-K and Count-Min Sketches. `demand-rollup` (03:15 UTC) writes yesterday into `catalog.demand_daily`. Read it with the internal secret:

```bash
curl -sS -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  "https://<host>/v1/internal/demand?days=7"
```

Routes with no fare sort first. The payload has no member id, IP, or device id.

**Failure.** Redis down: cache reads call the database, rate limits use memory, streams enqueue falls back to inline send, demand rollup writes nothing. Kafka down: the relay delivery retries; search latency does not change because the request never awaits the broker. A full search buffer drops the oldest event and increments `search_events_dropped`.

**Do not publish 6379 or 9092.** RedisInsight and kafka-ui are not services in Compose. If you need them, SSH-tunnel to the host and point them at the internal DNS names `redis-app` and `kafka`. The GlitchTip `redis` service is a different instance. Do not point the API at it.
