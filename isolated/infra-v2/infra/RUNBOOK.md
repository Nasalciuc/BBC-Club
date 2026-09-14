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
curl -s localhost:8000/ready | jq        # db, queue, staleJobs
curl -s localhost:8000/metrics | grep -E 'queue_pending|queue_dead|queue_oldest'
```

## Deploy

```bash
bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<sha>      # staging: deploy.sh staging <image>
```

Seven steps with automatic rollback if `/ready` stays red for 60 s. **Never deploy `:latest` to production** — the compose file refuses it. `deploy.sh` rejects any image that is not tagged with a commit SHA.

## Roll back right now

```bash
bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<previous-sha>
```

Schema is expand-only, so the previous image always runs against the current database.

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
