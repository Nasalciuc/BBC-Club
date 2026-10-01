#!/usr/bin/env bash
# Rolling deploy: dump → pull → migrate (direct Postgres) → one canary → roll API → recreate worker → prune.
#   bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:8f3c21a
#   bash infra/deploy.sh staging    ghcr.io/nasalciuc/bbc-api:8f3c21a
set -Eeuo pipefail
MODE="${1:?usage: deploy.sh <production|staging> <image:sha>}"; IMAGE="${2:?image with a SHA tag}"
[[ "$IMAGE" =~ ^[^:]+:[0-9a-f]{7,40}$ ]] || { echo "❌ image must be tagged with a commit SHA (got: $IMAGE)"; exit 1; }
[[ "$MODE" =~ ^(production|staging)$ ]] || { echo "❌ MODE must be exactly 'production' or 'staging' (got: $MODE)"; exit 1; }
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
PROD_ENV="$INFRA_DIR/env/production.env"; STG_ENV="$INFRA_DIR/env/staging.env"
export ENV_FILE="$PROD_ENV"
if [[ "$MODE" == "staging" ]]; then
  [[ -f "$STG_ENV" ]] || { echo "❌ $STG_ENV missing"; exit 1; }
  DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml -f $INFRA_DIR/compose.staging.yml --env-file $PROD_ENV --env-file $STG_ENV"
else
  DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml --env-file $PROD_ENV"
  [[ -f "$STG_ENV" ]] && DC="$DC -f $INFRA_DIR/compose.staging.yml --env-file $STG_ENV"
fi
if grep -qE '^(REDIS_URL|KAFKA_BROKERS)=.+' "$PROD_ENV" || { [[ -f "$STG_ENV" ]] && grep -qE '^(REDIS_URL|KAFKA_BROKERS)=.+' "$STG_ENV"; }; then
  DC="$DC --profile redis-kafka"
fi

if [[ "$MODE" == "production" ]]; then
  SVC=api; WORKER=worker; PG=postgres; POOLER=pgbouncer; CRON=cron; VAR=API_IMAGE; ENVF="$PROD_ENV"
  N="${API_REPLICAS:-4}"
  CANARY_SECONDS="${CANARY_SECONDS:-600}"
else
  SVC=api-staging; WORKER=worker-staging; PG=postgres-staging; POOLER=pgbouncer-staging; CRON=cron-staging; VAR=API_IMAGE_STAGING; ENVF="$STG_ENV"
  N="${API_REPLICAS_STAGING:-2}"
  CANARY_SECONDS="${CANARY_SECONDS:-120}"
fi
source <(grep -hE '^(OPS_WEBHOOK|SEC_WEBHOOK|POSTGRES_PASSWORD|POSTGRES_PASSWORD_STAGING|LOADTEST)=' "$PROD_ENV" "$ENVF" 2>/dev/null || true)
notify() { local hook="${2:-$OPS_WEBHOOK}"; [[ -n "${hook:-}" ]] && curl -fsS -X POST "$hook" -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" >/dev/null || true; echo "$1"; }

if [[ "$MODE" == "production" ]] && [[ "${LOADTEST:-}" == "1" ]]; then
  echo "❌ LOADTEST=1 is refused in production"; exit 1
fi

PREVIOUS=$(grep -E "^${VAR}=" "$ENVF" | cut -d= -f2- || true)
started=$(date +%s)

rollback_and_exit() {
  local why="$1"
  if [[ -n "$PREVIOUS" ]]; then
    echo "▶ ROLLBACK → $PREVIOUS ($why)"
    sed -i "s|^${VAR}=.*|${VAR}=${PREVIOUS}|" "$ENVF"
    if docker run --rm --entrypoint test "$PREVIOUS" -f apps/api/src/worker.ts; then
      $DC up -d --no-deps "$SVC" "$WORKER"
      if wait_service_ready "$SVC" 8000 && wait_service_ready "$WORKER" 8001; then
        notify "🚨 deploy $MODE rolled back to $PREVIOUS ($why). Schema is expand-only → old code is safe." "${SEC_WEBHOOK:-}"
      else
        notify "🚨 deploy $MODE rollback to $PREVIOUS started but /ready stayed red ($why)." "${SEC_WEBHOOK:-}"
      fi
    else
      echo "▶ previous image has no worker; API direct to Postgres, cron on ${SVC}:8000"
      local pre="$INFRA_DIR/compose.pre-worker.yml"
      [[ "$MODE" == "staging" ]] && pre="$INFRA_DIR/compose.pre-worker.staging.yml"
      $DC up -d --no-deps --scale "$WORKER=0" "$WORKER" || true
      local wids
      wids="$($DC ps -q "$WORKER" || true)"
      if [[ -n "${wids// }" ]]; then docker stop $wids >/dev/null || true; docker rm $wids >/dev/null || true; fi
      $DC -f "$pre" up -d --no-deps "$SVC"
      if wait_service_ready "$SVC" 8000; then
        $DC -f "$pre" up -d --no-deps --force-recreate "$CRON"
        notify "🚨 deploy $MODE rolled back to $PREVIOUS ($why). Previous image has no worker; cutover compose set aside (API direct to Postgres, cron on ${SVC}:8000)." "${SEC_WEBHOOK:-}"
      else
        notify "🚨 deploy $MODE rollback to $PREVIOUS started but /ready stayed red ($why). Cron was left unchanged." "${SEC_WEBHOOK:-}"
      fi
    fi
  else
    notify "🚨 first deploy of $MODE failed ($why) and there is nothing to roll back to. Logs: $DC logs $SVC --tail 200" "${SEC_WEBHOOK:-}"
  fi
  exit 1
}

wait_ready() {
  local container="$1" port="$2"
  local i
  for i in {1..12}; do
    docker exec "$container" bun -e "fetch('http://localhost:${port}/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && return 0
    sleep 5
  done
  return 1
}

wait_service_ready() {
  local svc="$1" port="$2"
  local ids c
  ids="$($DC ps -q "$svc" || true)"
  [[ -n "${ids// }" ]] || return 1
  for c in $ids; do
    wait_ready "$c" "$port" || return 1
  done
}

echo "▶ 1/7 pre-deploy dump ($MODE)"
mkdir -p /var/backups/pre-deploy
$DC exec -T "$PG" pg_dump -U bbc -Fc bbc > "/var/backups/pre-deploy/${MODE}-$(date +%Y%m%d-%H%M%S).dump"
find /var/backups/pre-deploy -type f -mtime +7 -delete

echo "▶ 2/7 pull $IMAGE"
if grep -qE "^${VAR}=" "$ENVF"; then sed -i "s|^${VAR}=.*|${VAR}=${IMAGE}|" "$ENVF"; else echo "${VAR}=${IMAGE}" >> "$ENVF"; fi
$DC pull -q "$SVC"
$DC pull -q "$WORKER"

echo "▶ 3/7 migrations (expand-only, direct Postgres — never the pooler)"
if [[ "$MODE" == "production" ]]; then
  MIGRATE_URL="postgres://bbc:${POSTGRES_PASSWORD}@postgres:5432/bbc"
else
  MIGRATE_URL="postgres://bbc:${POSTGRES_PASSWORD_STAGING}@postgres-staging:5432/bbc"
fi
if ! $DC run --rm --no-deps -e DB_POOLER=none -e DATABASE_URL="$MIGRATE_URL" "$SVC" bun run --filter @bbc/db db:migrate; then
  [[ -n "$PREVIOUS" ]] && sed -i "s|^${VAR}=.*|${VAR}=${PREVIOUS}|" "$ENVF"
  notify "🚨 deploy $MODE aborted at migration. Old API still serving." "${SEC_WEBHOOK:-}"; exit 1
fi

echo "▶ 4/7 canary one new $SVC replica for ${CANARY_SECONDS}s"
$DC up -d "$POOLER" || rollback_and_exit "pooler did not start"
OLD="$($DC ps -q "$SVC" || true)"
$DC up -d --no-deps --no-recreate --scale "$SVC=$((N + 1))" "$SVC" || rollback_and_exit "canary scale-up failed"
CANARY="$(comm -13 <(printf '%s\n' $OLD | sort) <($DC ps -q "$SVC" | sort) | head -n1 || true)"
[[ -n "$CANARY" ]] || rollback_and_exit "no canary container after scale-up"
drop_canary() { docker stop "$CANARY" >/dev/null 2>&1 || true; docker rm "$CANARY" >/dev/null 2>&1 || true; }
wait_ready "$CANARY" 8000 || { drop_canary; rollback_and_exit "/ready red on canary $CANARY"; }
sleep "$CANARY_SECONDS"
OLD_ONE="$(printf '%s\n' $OLD | head -n1 || true)"
if [[ -z "$OLD_ONE" ]]; then
  echo "no old replica; canary judged on /ready only"
else
  METRICS_DIR="$(mktemp -d)"
  metrics_of() {
    docker exec "$1" bun -e "fetch('http://localhost:8000/metrics').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))"
  }
  metrics_of "$CANARY" > "$METRICS_DIR/canary.txt" || { drop_canary; rollback_and_exit "canary /metrics unreadable"; }
  metrics_of "$OLD_ONE" > "$METRICS_DIR/old.txt" || { drop_canary; rollback_and_exit "old replica /metrics unreadable"; }
  if ! REASON="$(bun scripts/canary-compare.ts "$METRICS_DIR/canary.txt" "$METRICS_DIR/old.txt")"; then
    echo "$REASON"
    drop_canary
    rollback_and_exit "canary: ${REASON:-compare failed}"
  fi
  echo "$REASON"
  rm -rf "$METRICS_DIR"
fi

echo "▶ 5/7 roll $SVC (scale $((N + 1)) → $((N * 2)) → $N)"
$DC up -d --no-deps --no-recreate --scale "$SVC=$((N * 2))" "$SVC" || { drop_canary; rollback_and_exit "api scale-up failed"; }
NEW="$(comm -13 <(printf '%s\n' $OLD | sort) <($DC ps -q "$SVC" | sort) || true)"
if [[ -z "${NEW// }" ]]; then
  rollback_and_exit "no new $SVC containers after scale-up"
fi
for c in $NEW; do
  [[ "$c" == "$CANARY" ]] && continue
  wait_ready "$c" 8000 || { docker stop $NEW >/dev/null 2>&1 || true; docker rm $NEW >/dev/null 2>&1 || true; rollback_and_exit "/ready red on new replica $c"; }
done
if [[ -n "${OLD// }" ]]; then
  docker stop $OLD >/dev/null
  docker rm $OLD >/dev/null
fi
$DC up -d --no-deps --no-recreate --scale "$SVC=$N" "$SVC"

echo "▶ 6/7 recreate $WORKER (one process — never two pollers) and $CRON"
$DC up -d --no-deps --force-recreate "$WORKER" || rollback_and_exit "worker recreate failed"
W="$($DC ps -q "$WORKER" | head -n1)"
[[ -n "$W" ]] || rollback_and_exit "worker container missing"
wait_ready "$W" 8001 || rollback_and_exit "worker /ready red"
$DC up -d --no-deps --force-recreate "$CRON" || rollback_and_exit "cron recreate failed"

echo "▶ 7/7 cleanup"; docker image prune -f >/dev/null
notify "✅ deploy $MODE ok — $IMAGE in $(( $(date +%s) - started ))s"
