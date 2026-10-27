#!/usr/bin/env bash
# Rolling deploy: dump → pull and check env → migrate (direct Postgres) → one canary → roll API → recreate worker →
# staging demo → Caddy → the monitoring (production, MONITORING=on) → prune.
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
PROJECT=bbc # docker-compose.yml, name:
export ENV_FILE="$PROD_ENV"
if [[ "$MODE" == "staging" ]]; then
  [[ -f "$STG_ENV" ]] || { echo "❌ $STG_ENV missing"; exit 1; }
  DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml -f $INFRA_DIR/compose.staging.yml --env-file $PROD_ENV --env-file $STG_ENV"
else
  DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml --env-file $PROD_ENV"
  [[ -f "$STG_ENV" ]] && DC="$DC -f $INFRA_DIR/compose.staging.yml --env-file $STG_ENV"
fi
# shellcheck disable=SC1091
source "$INFRA_DIR/env-value.sh"
stg_file=""
if [[ "$MODE" == "staging" || -f "$STG_ENV" ]]; then
  stg_file="$STG_ENV"
  guard_staging "$stg_file" "$INFRA_DIR/docker-compose.yml" "$INFRA_DIR/compose.prod.yml"
fi
if redis_kafka_wanted "$PROD_ENV" "$stg_file"; then
  DC="$DC --profile redis-kafka"
fi
if glitchtip_wanted "$PROD_ENV"; then
  DC="$DC --profile glitchtip"
fi
if media_wanted "$PROD_ENV"; then
  DC="$DC --profile media"
fi
# The monitoring is the box's, like Caddy: a production deploy keeps it current (step 8). Grafana's admin password and
# the alerts' webhook are checked here, while nothing has changed yet (ADR-IMPL-073).
MONITORING_ON=""
if monitoring_wanted "$PROD_ENV"; then
  DC="$DC --profile monitoring"
  MONITORING_ON=1
  for k in GRAFANA_ADMIN_PASSWORD GRAFANA_ALERTS_WEBHOOK GRAFANA_PG_PASSWORD; do
    env_known "$PROD_ENV" "$k" || { echo "❌ MONITORING=on needs $k in $PROD_ENV (RUNBOOK § Monitoring)"; exit 1; }
  done
fi
# Caddy reloads at step 8 and restarts with the box: a missing or wrong origin certificate stops the deploy here, while
# nothing has changed yet.
origin_tls_check "$PROD_ENV" "$stg_file" || exit 1

if [[ "$MODE" == "production" ]]; then
  SVC=api; WORKER=worker; PG=postgres; POOLER=pgbouncer; CRON=cron; VAR=API_IMAGE; ENVF="$PROD_ENV"; NKEY=API_REPLICAS
  CANARY_SECONDS="${CANARY_SECONDS:-600}"
else
  SVC=api-staging; WORKER=worker-staging; PG=postgres-staging; POOLER=pgbouncer-staging; CRON=cron-staging; VAR=API_IMAGE_STAGING; ENVF="$STG_ENV"; NKEY=API_REPLICAS_STAGING
  CANARY_SECONDS="${CANARY_SECONDS:-120}"
fi
# The replica count the compose files ask for (docker-compose.yml, compose.staging.yml), read the way Compose reads it.
# The shell alone, as before, could scale to a count Compose never asked for; the next plain `up` would undo it.
N="$(compose_value "$NKEY" 2 "$PROD_ENV" "$stg_file")"
[[ "$N" =~ ^[1-9]$ ]] || { echo "❌ $NKEY must be a whole number from 1 to 9 (got: $N)"; exit 1; }
# Read values the way Compose does (quotes, CRLF, trailing comments): the parser bootstrap.sh uses. The deployed file wins.
for k in OPS_WEBHOOK SEC_WEBHOOK POSTGRES_PASSWORD POSTGRES_PASSWORD_STAGING LOADTEST; do
  v="$(env_value "$PROD_ENV" "$k")"
  [[ "$v" == "#"* ]] && v=""
  if [[ "$ENVF" != "$PROD_ENV" ]]; then
    w="$(env_value "$ENVF" "$k")"
    [[ "$w" == "#"* ]] && w=""
    [[ -n "$w" ]] && v="$w"
  fi
  if [[ "$v" == "$ENV_VALUE_UNKNOWN" ]]; then
    if [[ "$k" == "OPS_WEBHOOK" || "$k" == "SEC_WEBHOOK" ]]; then
      echo "⚠ $k could not be read — alerts for this deploy are skipped; check that line by hand"
      v=""
    else
      echo "❌ $k could not be read — check that line by hand"; exit 1
    fi
  fi
  printf -v "$k" '%s' "$v"
done
need=POSTGRES_PASSWORD; [[ "$MODE" == "staging" ]] && need=POSTGRES_PASSWORD_STAGING
[[ "${!need}" =~ ^[A-Za-z0-9._~-]+$ ]] || { echo "❌ $need must use only A-Z a-z 0-9 . _ ~ - (it goes into connection URLs). Regenerate: openssl rand -hex 32"; exit 1; }
notify() { local hook="${2:-$OPS_WEBHOOK}"; [[ -n "${hook:-}" ]] && curl -fsS -X POST "$hook" -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" >/dev/null || true; echo "$1"; }

if [[ "$MODE" == "production" ]] && [[ "${LOADTEST:-}" == "1" ]]; then
  echo "❌ LOADTEST=1 is refused in production"; exit 1
fi

PREVIOUS="$(env_value "$ENVF" "$VAR")"
[[ -z "$PREVIOUS" || "$PREVIOUS" =~ ^[^:]+:[0-9a-f]{7,40}$ ]] || { echo "❌ $VAR must be empty or an image tagged with a commit SHA (got: $PREVIOUS)"; exit 1; }
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

echo "▶ 1/8 pre-deploy dump ($MODE)"
mkdir -p /var/backups/pre-deploy
$DC exec -T "$PG" pg_dump -U bbc -Fc bbc > "/var/backups/pre-deploy/${MODE}-$(date +%Y%m%d-%H%M%S).dump"
find /var/backups/pre-deploy -type f -mtime +7 -delete

echo "▶ 2/8 pull $IMAGE and check $ENVF against it"
if grep -qE "^${VAR}=" "$ENVF"; then sed -i "s|^${VAR}=.*|${VAR}=${IMAGE}|" "$ENVF"; else echo "${VAR}=${IMAGE}" >> "$ENVF"; fi
# Any stop before the canary puts the previous tag back: the env file never keeps naming an image that did not deploy.
restore_tag() { if [[ -n "$PREVIOUS" ]]; then sed -i "s|^${VAR}=.*|${VAR}=${PREVIOUS}|" "$ENVF"; fi; }
if ! { $DC pull -q "$SVC" && $DC pull -q "$WORKER"; }; then
  restore_tag
  notify "🚨 deploy $MODE stopped: $IMAGE did not pull. Old API still serving." "${SEC_WEBHOOK:-}"
  exit 1
fi
# The new image checks the env with its own rules (scripts/check-env.ts), once as the API and once as the worker: a key
# this release needs is named here, while the old API still serves, not by a replica that will not start. An image
# built before the script existed (a rollback to it) deploys unchecked, as it always did.
for svc in "$SVC" "$WORKER"; do
  if ! docker run --rm --entrypoint test "$IMAGE" -f scripts/check-env.ts; then
    echo "⚠ $IMAGE has no scripts/check-env.ts: its env is not checked before the canary"
    break
  fi
  if ! $DC run --rm --no-deps "$svc" bun scripts/check-env.ts; then
    restore_tag
    notify "🚨 deploy $MODE stopped: $ENVF does not pass $IMAGE's checks as $svc (scripts/check-env.ts, in the deploy log). Old API still serving." "${SEC_WEBHOOK:-}"
    exit 1
  fi
done

echo "▶ 3/8 migrations (expand-only, direct Postgres — never the pooler)"
if [[ "$MODE" == "production" ]]; then
  MIGRATE_URL="postgres://bbc:${POSTGRES_PASSWORD}@postgres:5432/bbc"
else
  MIGRATE_URL="postgres://bbc:${POSTGRES_PASSWORD_STAGING}@postgres-staging:5432/bbc"
fi
if ! $DC run --rm --no-deps -e DB_POOLER=none -e DATABASE_URL="$MIGRATE_URL" "$SVC" bun run --filter @bbc/db db:migrate; then
  restore_tag
  notify "🚨 deploy $MODE aborted at migration. Old API still serving." "${SEC_WEBHOOK:-}"; exit 1
fi

echo "▶ 4/8 canary one new $SVC replica for ${CANARY_SECONDS}s"
# The pooler alone. Without --no-deps Compose would also recreate Postgres whenever one of its settings changed, in the
# middle of a deploy; Postgres takes new settings only when it is recreated on purpose (RUNBOOK § Memory and replicas).
$DC up -d --no-deps "$POOLER" || rollback_and_exit "pooler did not start"
# The containers Compose counts for --scale: the service's own, stopped ones too, never the one-off containers of
# `compose run` (a job an operator runs beside the deploy). Counting only running ones, a stopped old container would be
# started instead of a new one and judged as the canary; counting one-offs, step 5 would stop someone's job.
svc_ids() {
  docker ps -aq --no-trunc --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=$1" --filter label=com.docker.compose.oneoff=False
}
OLD="$(svc_ids "$SVC")"
OLD_ONE="$($DC ps -q "$SVC" | head -n1 || true)"
# Counted, not assumed to be N: after API_REPLICAS changes, N+1 could be no more containers than run now, and no canary.
OLDN="$(printf '%s\n' $OLD | grep -c . || true)"
$DC up -d --no-deps --no-recreate --scale "$SVC=$((OLDN + 1))" "$SVC" || rollback_and_exit "canary scale-up failed"
CANARY="$(comm -13 <(printf '%s\n' $OLD | sort) <(svc_ids "$SVC" | sort) | head -n1 || true)"
[[ -n "$CANARY" ]] || rollback_and_exit "no canary container after scale-up"
drop_canary() { docker stop "$CANARY" >/dev/null 2>&1 || true; docker rm "$CANARY" >/dev/null 2>&1 || true; }
wait_ready "$CANARY" 8000 || { drop_canary; rollback_and_exit "/ready red on canary $CANARY"; }
sleep "$CANARY_SECONDS"
if [[ -z "$OLD_ONE" ]]; then
  echo "no old replica; canary judged on /ready only"
else
  METRICS_DIR="$(mktemp -d)"
  chmod 0700 "$METRICS_DIR"
  cleanup_metrics() { rm -rf "$METRICS_DIR"; }
  metrics_of() {
    docker exec "$1" bun -e "fetch('http://localhost:8000/metrics').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))"
  }
  metrics_of "$CANARY" > "$METRICS_DIR/canary.txt" || { cleanup_metrics; drop_canary; rollback_and_exit "canary /metrics unreadable"; }
  metrics_of "$OLD_ONE" > "$METRICS_DIR/old.txt" || { cleanup_metrics; drop_canary; rollback_and_exit "old replica /metrics unreadable"; }
  chmod 0600 "$METRICS_DIR"/*.txt
  # Image USER is bbc; run the one-shot compare as root so 0600 host files stay private.
  if ! REASON="$(docker run --rm --user 0:0 -v "$METRICS_DIR:$METRICS_DIR:ro" "$IMAGE" bun scripts/canary-compare.ts "$METRICS_DIR/canary.txt" "$METRICS_DIR/old.txt")"; then
    echo "$REASON"
    cleanup_metrics
    drop_canary
    rollback_and_exit "canary: ${REASON:-compare failed}"
  fi
  echo "$REASON"
  cleanup_metrics
fi

echo "▶ 5/8 roll $SVC (scale $((OLDN + 1)) → $((OLDN + N)) → $N)"
$DC up -d --no-deps --no-recreate --scale "$SVC=$((OLDN + N))" "$SVC" || { drop_canary; rollback_and_exit "api scale-up failed"; }
NEW="$(comm -13 <(printf '%s\n' $OLD | sort) <(svc_ids "$SVC" | sort) || true)"
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

echo "▶ 6/8 recreate $WORKER (one process — never two pollers) and $CRON"
$DC up -d --no-deps --force-recreate "$WORKER" || rollback_and_exit "worker recreate failed"
W="$($DC ps -q "$WORKER" | head -n1)"
[[ -n "$W" ]] || rollback_and_exit "worker container missing"
wait_ready "$W" 8001 || rollback_and_exit "worker /ready red"
$DC up -d --no-deps --force-recreate "$CRON" || rollback_and_exit "cron recreate failed"

if [[ "$MODE" == "staging" ]]; then
  echo "▶ 7/8 staging demo (ADR-IMPL-040): the review account carries Figma's situations, dated from today"
  # Direct Postgres, never the pooler. The script refuses any database but staging's. A failure never undoes the
  # deploy — the API is already serving — but it is said out loud.
  if ! $DC run --rm --no-deps -e DB_POOLER=none -e DATABASE_URL="$MIGRATE_URL" "$SVC" bun run scripts/seed-staging-demo.ts; then
    notify "⚠ deploy staging: the demo data did not refresh — run infra/deploy.sh's step 7 by hand (RUNBOOK, Staging demo data)" "${OPS_WEBHOOK:-}"
  fi
else
  echo "▶ 7/8 staging demo — production: skipped (the review account is created by hand, docs/release.md)"
fi

echo "▶ 8/8 Caddy and the monitoring, then cleanup"
# Caddy takes this commit's Caddyfile. A one-off container checks it first (certificates included), so a bad file never
# replaces a working one; then a new container only if one of its settings changed (docker-compose.yml, a few seconds
# without traffic), and a graceful reload, which keeps connections open. One Caddy serves both environments, so a staging
# deploy applies infra/caddy only as main has it: a branch's is checked, and waits for review. A box whose Caddy
# bootstrap never made (staging behind a tunnel) is left as it is: a deploy keeps a Caddy current, it does not start one.
if [[ -z "$($DC ps -a -q caddy 2>/dev/null)" ]]; then
  echo "no Caddy container on this box: Caddy left as it is"
elif ! CADDY_CHECK="$($DC run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile 2>&1)"; then
  printf '%s\n' "$CADDY_CHECK" | tail -n 5
  notify "🚨 deploy $MODE: $IMAGE is live, but this commit's Caddyfile does not validate (above); Caddy keeps its current config." "${SEC_WEBHOOK:-}"
  exit 1
elif [[ "$MODE" == "staging" ]] && ! git -C "$APP_DIR" diff --quiet origin/main -- "$INFRA_DIR/caddy" 2>/dev/null; then
  echo "Caddyfile valid; Caddy keeps its config: infra/caddy here is not origin/main's, and Caddy serves production too"
elif ! { $DC up -d --no-deps caddy && $DC exec -T caddy caddy reload --config /etc/caddy/Caddyfile; }; then
  notify "🚨 deploy $MODE: $IMAGE is live, but Caddy did not take this commit's config — $DC logs caddy --tail 50" "${SEC_WEBHOOK:-}"
  exit 1
fi
# The monitoring takes this commit's images and settings, production only: one stack serves both environments, as
# Caddy does. Its files (scrape targets, dashboards) are read from the checkout; only a changed setting or image
# recreates a container. --wait holds until each container's healthcheck answers: VictoriaMetrics' and Grafana's (six
# probes 10 s apart, so a start has about a minute) and cAdvisor's, which its image brings (every 30 s); node-exporter
# has none and counts once it runs. A container that starts and then fails therefore counts as not started. A failure
# here leaves the API as it is: it is live already; the deploy still ends with an error, after the prune, whether or
# not the webhook answered, so a monitoring that asked to run and did not is never reported as a deploy that went well.
MONITORING_FAILED=""
if [[ -n "$MONITORING_ON" && "$MODE" == "production" ]]; then
  # Grafana's database dashboard reads Postgres as bbc_monitor (0052, ADR-IMPL-077): the role takes its password from
  # production.env here, through psql's stdin — never on a command line, never in a migration.
  pg_pw="$(env_value "$PROD_ENV" GRAFANA_PG_PASSWORD)"
  if ! printf "ALTER ROLE bbc_monitor LOGIN PASSWORD '%s';\n" "${pg_pw//\'/\'\'}" \
    | $DC exec -T postgres psql -q -v ON_ERROR_STOP=1 -U bbc -d bbc >/dev/null; then
    notify "⚠ deploy production: $IMAGE is live, but Grafana's database role took no password — the database dashboard stays empty (RUNBOOK § Monitoring)" "${OPS_WEBHOOK:-}"
  fi
  if ! $DC up -d --no-deps --wait --wait-timeout 120 victoriametrics grafana node-exporter cadvisor; then
    notify "⚠ deploy production: $IMAGE is live, but the monitoring did not start — $DC logs grafana --tail 50" "${OPS_WEBHOOK:-}"
    MONITORING_FAILED=1
  fi
fi
docker image prune -f >/dev/null
# Old API images are tagged, so prune never takes them, and each is a few hundred MB. Kept: this image and the one it
# replaced (the rollback), the other environment's image, and the five newest. An image a container uses refuses to go.
keep="$(printf '%s\n' "$IMAGE" "$PREVIOUS" "$(env_value "$PROD_ENV" API_IMAGE)" "$(env_value "$PROD_ENV" API_IMAGE_STAGING)" \
  "$(env_value "$STG_ENV" API_IMAGE_STAGING)")"
removed=0
while read -r ref; do
  if grep -qxF "$ref" <<<"$keep"; then continue; fi
  if docker image rm "$ref" >/dev/null 2>&1; then removed=$((removed + 1)); fi
done < <(docker image ls "${IMAGE%:*}" --format '{{.Repository}}:{{.Tag}}' | grep -v ':<none>$' | tail -n +6)
echo "old API images removed: $removed"
if [[ -n "$MONITORING_FAILED" ]]; then
  echo "❌ deploy $MODE: $IMAGE is live, but the monitoring did not start (above)"
  exit 1
fi
notify "✅ deploy $MODE ok — $IMAGE in $(( $(date +%s) - started ))s"
