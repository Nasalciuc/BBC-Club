# infra/ — one machine, one compose file, three modes

| Mode                                    | Command                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------- |
| dev (Postgres only; API on your laptop) | `docker compose -f infra/docker-compose.yml --profile dev up -d postgres` |
| test (throwaway, tmpfs)                 | `docker compose -f infra/compose.test.yml up -d --wait`                   |
| staging                                 | `bash infra/deploy.sh staging ghcr.io/nasalciuc/bbc-api:<sha>`            |
| production (release)                    | `bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:<sha>`         |

The raw `docker compose … up -d` commands are for bootstrap and operations (restart, inspect). Releases always go through `deploy.sh`, which takes a pre-deploy dump, runs migrations as a separate job, waits for `/ready`, and rolls back automatically.

**Scripts:** `bootstrap.sh` (empty VPS → running stack, idempotent; `--with-staging` adds the staging services) · `deploy.sh` (7 steps, automatic rollback) · `restore.sh` (point-in-time, double confirmation) · `restore-test.sh` (monthly drill with assertions) · `rotate-secret.sh` (double window) · `pgbackrest-init.sh` (first backup) · `host/backup.sh` + `host/disk-check.sh` (host cron).

**Decisions behind this:** ADR-IMPL-002 (everything on our own VPS; email, iOS builds and backups stay off it) and ADR-IMPL-010 (compose layering, nothing exposed but Caddy, backup from day one, deploy with rollback, secrets in a 600 env file with rotation, two alert channels, staging on the same host until the first real offer).

**Operating it:** `RUNBOOK.md`. It is a deliverable, not documentation — if you cannot restore the database by reading it, it is broken.

**v2 (after code review):** pgBackRest runs inside the postgres container (archive_command needs the binary); options via `PGBACKREST_*` env; one Caddy serves both domains with Cloudflare `trusted_proxies`; staging = extra services in the same project; `edge`/`data` networks (`data` is internal); host cron for backups/drill/disk; `apps/api/Dockerfile` + `api-deploy.yml` added; `eas.json` without `$VAR` interpolation.
