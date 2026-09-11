#!/usr/bin/env bash
# Disk alert at 70 %, once per hour at most. The #1 incident on small VPSes, prevented.
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
ENV_FILE="$INFRA_DIR/env/production.env"
source <(grep -E '^OPS_WEBHOOK=' "$ENV_FILE" || true)
USE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
STAMP=/run/bbc-disk-alerted
if (( USE >= 70 )); then
  if [[ ! -f $STAMP ]] || (( $(date +%s) - $(stat -c %Y $STAMP) > 3600 )); then
    [[ -n "${OPS_WEBHOOK:-}" ]] && curl -fsS -X POST "$OPS_WEBHOOK" -H 'Content-Type: application/json' -d "{\"text\":\"⚠️ disk at ${USE}% on $(hostname). See RUNBOOK → Disk filling up.\"}" >/dev/null || true
    touch $STAMP
  fi
else
  rm -f $STAMP
fi
