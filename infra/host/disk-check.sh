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
# Read the webhook the way Compose does — never source the env file, which would run whatever a value contains.
# shellcheck disable=SC1091
source "$INFRA_DIR/env-value.sh"
OPS_WEBHOOK="$(env_optional "$ENV_FILE" OPS_WEBHOOK)"
USE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
STAMP="${BBC_DISK_STAMP:-/run/bbc-disk-alerted}" # overridable for the test only
if (( USE >= 70 )); then
  if [[ ! -f $STAMP ]] || (( $(date +%s) - $(stat -c %Y $STAMP) > 3600 )); then
    # Always in the log (/var/log/bbc-disk.log); the hour's quiet starts only once the webhook took it, so a dead or
    # missing webhook is retried at the next run and said each time (audit, 30 Oct 2026).
    MSG="⚠️ disk at ${USE}% on $(hostname). See RUNBOOK → Disk filling up."
    echo "$(date -Iseconds) $MSG"
    if webhook_post "$MSG" "${OPS_WEBHOOK:-}"; then
      touch $STAMP
    else
      echo "$(date -Iseconds) the alert reached no webhook (OPS_WEBHOOK unset or failing): only this log has it"
    fi
  fi
else
  rm -f $STAMP
fi
