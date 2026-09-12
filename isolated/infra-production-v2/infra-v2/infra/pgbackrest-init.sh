#!/usr/bin/env bash
# One-time, production: create the stanza, first full backup, verify. Runs inside the postgres container.
set -Eeuo pipefail
# Work from the script's own location so this works whether infra/ is at the repo root
# (after the monorepo assembly) or nested under isolated/ (today).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
  INFRA_DIR="$SCRIPT_DIR"
elif [[ -f "$SCRIPT_DIR/../docker-compose.yml" ]]; then
  INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  INFRA_DIR="$SCRIPT_DIR"
fi
APP_DIR="$(cd "$INFRA_DIR/.." && pwd)"
cd "$APP_DIR"
DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml --env-file $INFRA_DIR/env/production.env"
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc stanza-create
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc check
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc --type=full backup
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc info
echo "✅ stanza ready: daily full (01:30 UTC) + diff every 6h via /etc/cron.d/bbc; WAL archives continuously. Now run restore-test.sh."
