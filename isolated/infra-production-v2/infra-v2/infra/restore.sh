#!/usr/bin/env bash
# Restore PRODUCTION from pgBackRest (latest or point-in-time). Double confirmation. Runs inside the postgres container.
#   bash infra/restore.sh                       # latest
#   bash infra/restore.sh --to-time "2026-09-11 14:00:00+00"
set -Eeuo pipefail
TARGET=""; [[ "${1:-}" == "--to-time" ]] && TARGET="${2:?timestamp}"
APP_DIR="${APP_DIR:-/opt/bbc}"; cd "$APP_DIR"
export ENV_FILE="$APP_DIR/infra/env/production.env"
DC="docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file $ENV_FILE"
echo "This DESTROYS the current production database and restores from backup${TARGET:+ to $TARGET}."
read -rp "Type 'production' to confirm: " a; [[ "$a" == "production" ]] || { echo aborted; exit 1; }
read -rp "Are you sure? (yes): " b; [[ "$b" == "yes" ]] || { echo aborted; exit 1; }

echo "▶ stopping api/cron"; $DC stop api cron
echo "▶ restoring (postgres server stopped, container kept alive for the binary)"
$DC exec -T postgres bash -c "pg_ctl -D /var/lib/postgresql/data -m fast stop" || true
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc --delta ${TARGET:+--type=time --target="$TARGET" --target-action=promote} restore
$DC restart postgres
for i in {1..30}; do $DC exec -T postgres pg_isready -U bbc -d bbc >/dev/null 2>&1 && break; sleep 2; done
$DC exec -T postgres psql -U bbc -d bbc -tAc "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('platform','auth','members','notifications','proposals','engagement','crm','personalization')" | grep -q '^8$' && echo "✓ 8 schemas" || echo "⚠ schema count unexpected"
$DC up -d api cron
echo "✅ restore complete — check /ready and the newest journal event"
