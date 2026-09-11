#!/usr/bin/env bash
# One-time, production: create the stanza, first full backup, verify. Runs inside the postgres container.
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/opt/bbc}"; cd "$APP_DIR"
DC="docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file infra/env/production.env"
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc stanza-create
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc check
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc --type=full backup
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc info
echo "✅ stanza ready: daily full (01:30 UTC) + diff every 6h via /etc/cron.d/bbc; WAL archives continuously. Now run restore-test.sh."
