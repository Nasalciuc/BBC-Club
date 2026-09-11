#!/usr/bin/env bash
# Disk alert at 70 %, once per hour at most. The #1 incident on small VPSes, prevented.
set -Eeuo pipefail
ENV_FILE="/opt/bbc/infra/env/production.env"
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
