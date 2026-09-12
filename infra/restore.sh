#!/usr/bin/env bash
# Restore PRODUCTION from pgBackRest (latest or point-in-time). Double confirmation. Runs inside the postgres container.
#   bash infra/restore.sh                       # latest
#   bash infra/restore.sh --to-time "2026-09-11 14:00:00+00"
set -Eeuo pipefail
TARGET=""; [[ "${1:-}" == "--to-time" ]] && TARGET="${2:?timestamp}"
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
export ENV_FILE="$INFRA_DIR/env/production.env"
DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml --env-file $ENV_FILE"
echo "This DESTROYS the current production database and restores from backup${TARGET:+ to $TARGET}."
read -rp "Type 'production' to confirm: " a; [[ "$a" == "production" ]] || { echo aborted; exit 1; }
read -rp "Are you sure? (yes): " b; [[ "$b" == "yes" ]] || { echo aborted; exit 1; }

echo "▶ stopping api/cron"; $DC stop api cron
echo "▶ restoring (postgres server stopped, container kept alive for the binary)"
$DC exec -T postgres bash -c "pg_ctl -D /var/lib/postgresql/data -m fast stop" || true
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc --delta ${TARGET:+--type=time --target="$TARGET" --target-action=promote} restore
$DC restart postgres
ok=false
for i in {1..30}; do $DC exec -T postgres pg_isready -U bbc -d bbc >/dev/null 2>&1 && { ok=true; break; }; sleep 2; done
[[ "$ok" == true ]] || { echo "❌ postgres did not come back after restore"; exit 1; }
schemas=$($DC exec -T postgres psql -U bbc -d bbc -tAc "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('platform','auth','members','notifications','proposals','engagement','crm','personalization')" | tr -d '[:space:]')
[[ "$schemas" == "8" ]] || { echo "❌ restored database has $schemas of 8 schemas — NOT starting the API"; exit 1; }
echo "✓ 8 schemas"
$DC up -d api cron
echo "✅ restore complete — check /ready and the newest journal event"
