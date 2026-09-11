#!/usr/bin/env bash
# pgBackRest backup, executed INSIDE the postgres container (where the binary and the data are).
set -Eeuo pipefail
TYPE="${1:-diff}"                            # full | diff | incr
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
ENV_FILE="$INFRA_DIR/env/production.env"
DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml --env-file $ENV_FILE"
source <(grep -E '^(OPS_WEBHOOK|SEC_WEBHOOK)=' "$ENV_FILE" || true)
notify() { [[ -n "${2:-}" ]] && curl -fsS -X POST "$2" -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" >/dev/null || true; echo "$1"; }
if $DC exec -T -u postgres postgres pgbackrest --stanza=bbc --type="$TYPE" backup; then
  notify "✅ backup $TYPE ok $(date -u +%H:%M)" "${OPS_WEBHOOK:-}"
else
  notify "🚨 backup $TYPE FAILED — backups are stale, investigate today" "${SEC_WEBHOOK:-}"
  exit 1
fi
