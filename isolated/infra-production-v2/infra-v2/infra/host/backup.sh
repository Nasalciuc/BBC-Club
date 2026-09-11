#!/usr/bin/env bash
# pgBackRest backup, executed INSIDE the postgres container (where the binary and the data are).
set -Eeuo pipefail
TYPE="${1:-diff}"                            # full | diff | incr
APP_DIR="${APP_DIR:-/opt/bbc}"; cd "$APP_DIR"
ENV_FILE="$APP_DIR/infra/env/production.env"
DC="docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file $ENV_FILE"
source <(grep -E '^(OPS_WEBHOOK|SEC_WEBHOOK)=' "$ENV_FILE" || true)
notify() { [[ -n "${2:-}" ]] && curl -fsS -X POST "$2" -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" >/dev/null || true; echo "$1"; }
if $DC exec -T -u postgres postgres pgbackrest --stanza=bbc --type="$TYPE" backup; then
  notify "✅ backup $TYPE ok $(date -u +%H:%M)" "${OPS_WEBHOOK:-}"
else
  notify "🚨 backup $TYPE FAILED — backups are stale, investigate today" "${SEC_WEBHOOK:-}"
  exit 1
fi
