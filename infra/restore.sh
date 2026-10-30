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

# The worker too: it polls the journal and runs cron's jobs, and must not meet a database being restored, nor start on
# one before the schema check below.
echo "▶ stopping api, worker and cron"; $DC stop api worker cron
echo "▶ restoring (postgres server stopped, container kept alive for the binary)"
$DC exec -T postgres bash -c "pg_ctl -D /var/lib/postgresql/data -m fast stop" || true
$DC exec -T -u postgres postgres pgbackrest --stanza=bbc --delta ${TARGET:+--type=time --target="$TARGET" --target-action=promote} restore
$DC restart postgres
# pg_isready says "rejecting connections" while the restore replays WAL up to a consistent state (minutes for a
# point-in-time restore) and "no response" while the server is down: only a server silent for a minute fails here.
ok=false; silent=0; st=""
for i in {1..720}; do
  st="$($DC exec -T postgres pg_isready -U bbc -d bbc 2>&1 || true)"
  case "$st" in
    *"accepting connections"*) ok=true; break ;;
    *"rejecting connections"*) silent=0 ;;
    *) silent=$(( silent + 1 )); (( silent >= 12 )) && break ;;
  esac
  sleep 5
done
[[ "$ok" == true ]] || { echo "❌ postgres did not come back after restore: ${st:-no answer}"; exit 1; }
# pg_isready answers as soon as Postgres takes connections, and a restore still replaying WAL takes them, read-only:
# nothing is checked or started until it has reached its target and been promoted (an hour at most; RTO ≈ 45 min).
# A check that fails is not replay (a password the restored database does not take, a role it lacks): it is said at once.
promoted=false; failed=0
for i in {1..720}; do
  if rec="$($DC exec -T postgres psql -U bbc -d bbc -tAc "SELECT pg_is_in_recovery()" 2>&1)"; then
    failed=0
    [[ "$(tr -d '[:space:]' <<<"$rec")" == "f" ]] && { promoted=true; break; }
  else
    failed=$(( failed + 1 ))
    (( failed >= 3 )) && { echo "❌ Postgres answers but refuses the recovery check: $rec — the API, the worker and cron NOT started"; exit 1; }
  fi
  (( i % 12 == 0 )) && echo "… Postgres still replaying WAL ($(( i / 12 )) min)"
  sleep 5
done
[[ "$promoted" == true ]] || { echo "❌ Postgres still replaying WAL after an hour — the API, the worker and cron NOT started"; exit 1; }
schemas=$($DC exec -T postgres psql -U bbc -d bbc -tAc "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('platform','auth','members','notifications','proposals','engagement','crm','personalization')" | tr -d '[:space:]')
[[ "$schemas" == "8" ]] || { echo "❌ restored database has $schemas of 8 schemas — NOT starting the API"; exit 1; }
echo "✓ 8 schemas"
# --no-deps: Postgres was just restored and checked; a plain `up` would make it again (it reads production.env, which
# every deploy rewrites). Cron sends its jobs to the worker (API_URL), so it starts once the worker answers /ready, as at
# a deploy's step 6.
$DC up -d --no-deps api worker
W="$($DC ps -q worker | head -n1 || true)"
ready=false
if [[ -n "$W" ]]; then
  for i in {1..12}; do
    # Five seconds a probe: a stalled answer would otherwise wait for the server's idle timeout (120 s).
    docker exec "$W" bun -e "fetch('http://localhost:8001/ready',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && { ready=true; break; }
    sleep 5
  done
fi
[[ "$ready" == true ]] || { echo "❌ the worker's /ready stayed red — cron NOT started: $DC logs worker --tail 100, then $DC up -d --no-deps cron"; exit 1; }
$DC up -d --no-deps cron
echo "✅ restore complete — check /ready and the newest journal event"
