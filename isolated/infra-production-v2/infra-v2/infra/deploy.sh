#!/usr/bin/env bash
# Seven idempotent steps with automatic rollback when /ready stays red.
#   bash infra/deploy.sh production ghcr.io/nasalciuc/bbc-api:8f3c21a
#   bash infra/deploy.sh staging    ghcr.io/nasalciuc/bbc-api:8f3c21a
set -Eeuo pipefail
MODE="${1:?usage: deploy.sh <production|staging> <image:sha>}"; IMAGE="${2:?image with a SHA tag}"
[[ "$IMAGE" =~ ^[^:]+:[0-9a-f]{7,40}$ ]] || { echo "❌ image must be tagged with a commit SHA (got: $IMAGE)"; exit 1; }
[[ "$MODE" =~ ^(production|staging)$ ]] || { echo "❌ MODE must be exactly 'production' or 'staging' (got: $MODE)"; exit 1; }
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
PROD_ENV="$INFRA_DIR/env/production.env"; STG_ENV="$INFRA_DIR/env/staging.env"
export ENV_FILE="$PROD_ENV"
if [[ "$MODE" == "staging" ]]; then
  [[ -f "$STG_ENV" ]] || { echo "❌ $STG_ENV missing"; exit 1; }
  DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml -f $INFRA_DIR/compose.staging.yml --env-file $PROD_ENV --env-file $STG_ENV"
else
  DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml --env-file $PROD_ENV"
  [[ -f "$STG_ENV" ]] && DC="$DC -f $INFRA_DIR/compose.staging.yml --env-file $STG_ENV"   # keep staging running while deploying production
fi

if [[ "$MODE" == "production" ]]; then SVC=api; PG=postgres; VAR=API_IMAGE; ENVF="$PROD_ENV"; else SVC=api-staging; PG=postgres-staging; VAR=API_IMAGE_STAGING; ENVF="$STG_ENV"; fi
source <(grep -E '^(OPS_WEBHOOK|SEC_WEBHOOK)=' "$PROD_ENV" || true)
notify() { local hook="${2:-$OPS_WEBHOOK}"; [[ -n "${hook:-}" ]] && curl -fsS -X POST "$hook" -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" >/dev/null || true; echo "$1"; }
PREVIOUS=$(grep -E "^${VAR}=" "$ENVF" | cut -d= -f2- || true)
started=$(date +%s)

echo "▶ 1/7 pre-deploy dump ($MODE)"
mkdir -p /var/backups/pre-deploy
$DC exec -T "$PG" pg_dump -U bbc -Fc bbc > "/var/backups/pre-deploy/${MODE}-$(date +%Y%m%d-%H%M%S).dump"
find /var/backups/pre-deploy -type f -mtime +7 -delete

echo "▶ 2/7 pull $IMAGE"
if grep -qE "^${VAR}=" "$ENVF"; then sed -i "s|^${VAR}=.*|${VAR}=${IMAGE}|" "$ENVF"; else echo "${VAR}=${IMAGE}" >> "$ENVF"; fi
$DC pull -q "$SVC"

echo "▶ 3/7 migrations (expand-only, separate job)"
if ! $DC run --rm --no-deps "$SVC" bun run --filter @bbc/db db:migrate; then
  [[ -n "$PREVIOUS" ]] && sed -i "s|^${VAR}=.*|${VAR}=${PREVIOUS}|" "$ENVF"
  notify "🚨 deploy $MODE aborted at migration. Old API still serving." "${SEC_WEBHOOK:-}"; exit 1
fi

echo "▶ 4/7 start"; $DC up -d "$SVC"

echo "▶ 5/7 /ready (60s)"; ok=false
for i in {1..12}; do $DC exec -T "$SVC" bun -e "fetch('http://localhost:8000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && { ok=true; break; }; sleep 5; done

if [[ "$ok" != true ]]; then
  if [[ -n "$PREVIOUS" ]]; then
    echo "▶ 6/7 ROLLBACK → $PREVIOUS"; sed -i "s|^${VAR}=.*|${VAR}=${PREVIOUS}|" "$ENVF"; $DC up -d "$SVC"
    notify "🚨 deploy $MODE rolled back to $PREVIOUS (/ready red). Schema is expand-only → old code is safe." "${SEC_WEBHOOK:-}"
  else
    notify "🚨 first deploy of $MODE failed and there is nothing to roll back to. Logs: $DC logs $SVC --tail 200" "${SEC_WEBHOOK:-}"
  fi
  exit 1
fi

echo "▶ 7/7 cleanup"; docker image prune -f >/dev/null
notify "✅ deploy $MODE ok — $IMAGE in $(( $(date +%s) - started ))s"
