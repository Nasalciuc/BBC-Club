#!/usr/bin/env bash
# Monthly drill: restore the latest backup into a THROWAWAY container built from the SAME postgres image
# (same uid → no permission surprises), assert the shape, report, destroy.
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
# shellcheck disable=SC1091
source "$INFRA_DIR/env-value.sh"
OPS_WEBHOOK="$(env_optional "$ENV_FILE" OPS_WEBHOOK)"
SEC_WEBHOOK="$(env_optional "$ENV_FILE" SEC_WEBHOOK)"
notify() { local hook="${2:-$OPS_WEBHOOK}"; [[ -n "${hook:-}" ]] && curl -fsS -X POST "$hook" -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" >/dev/null || true; echo "$1"; }
# Install the cleanup before anything exists, so a failure while building the secrets file still reports and still removes
# only what this run created.
CLEAN_ENV="" CT="" VOL="" reported=0
cleanup() {
  local code=$?
  [[ -n "$CT" ]] && docker rm -f "$CT" >/dev/null 2>&1 || true
  [[ -n "$VOL" ]] && docker volume rm "$VOL" >/dev/null 2>&1 || true
  [[ -n "$CLEAN_ENV" ]] && rm -f "$CLEAN_ENV"
  if (( code != 0 && reported == 0 )); then
    notify "🚨 RESTORE DRILL STOPPED before it could report — look at the output above." "${SEC_WEBHOOK:-}"
  fi
}
trap cleanup EXIT
# docker run --env-file reads lines literally (quotes and trailing comments included), unlike Compose. Hand it a clean copy:
# every PGBACKREST_* key read the way Compose reads it, plus the password the restored cluster's local socket asks for.
CLEAN_ENV="$(mktemp)"
chmod 600 "$CLEAN_ENV"
for k in $(grep -oE '^[[:space:]]*PGBACKREST_[A-Z0-9_]+' "$ENV_FILE" | sed -E 's/^[[:space:]]+//' | sort -u); do
  v="$(env_value "$ENV_FILE" "$k")"
  [[ "$v" == "$ENV_VALUE_UNKNOWN" || "$v" == "#"* ]] && { echo "❌ $k could not be read, or is not filled in — check that line by hand"; exit 1; }
  printf '%s=%s\n' "$k" "$v" >> "$CLEAN_ENV"
done
env_known "$ENV_FILE" POSTGRES_PASSWORD || { echo "❌ POSTGRES_PASSWORD could not be read, or is not filled in — check that line by hand"; exit 1; }
printf 'PGPASSWORD=%s\n' "$(env_value "$ENV_FILE" POSTGRES_PASSWORD)" >> "$CLEAN_ENV"
STAMP=$(date +%Y%m%d-%H%M%S); VOL="bbc_restoretest_$STAMP"; CT="bbc-restoretest-$STAMP"

echo "▶ restore latest backup into $VOL (image bbc-postgres:16, pgbackrest env from production.env)"
docker volume create "$VOL" >/dev/null
docker run --rm --env-file "$CLEAN_ENV" -e PGBACKREST_STANZA=bbc -u postgres -v "$VOL:/var/lib/postgresql/data" bbc-postgres:16 \
  pgbackrest --stanza=bbc --delta --archive-mode=off restore
docker run -d --name "$CT" --env-file "$CLEAN_ENV" -e POSTGRES_PASSWORD=unused -v "$VOL:/var/lib/postgresql/data" bbc-postgres:16 \
  postgres -c archive_mode=off >/dev/null
for i in {1..40}; do docker exec "$CT" pg_isready -U bbc -d bbc >/dev/null 2>&1 && break; sleep 2; done

fail=0; q() { docker exec "$CT" psql -U bbc -d bbc -tAc "$1" 2>/dev/null || echo ERR; }
schemas=$(q "SELECT count(*) FROM information_schema.schemata WHERE schema_name IN ('platform','auth','members','notifications','proposals','engagement','crm','personalization')")
[[ "$schemas" == "8" ]] || { echo "❌ schemas=$schemas (want 8)"; fail=1; }
part=$(q "SELECT count(*) FROM pg_partitioned_table p JOIN pg_class c ON c.oid=p.partrelid WHERE c.relname='domain_events'")
[[ "$part" == "1" ]] || { echo "❌ domain_events not partitioned"; fail=1; }
users=$(q 'SELECT count(*) FROM auth."user"'); [[ "$users" =~ ^[0-9]+$ ]] || { echo "❌ auth.user unreadable"; fail=1; }
age=$(q "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - max(occurred_at)))::int, -1) FROM platform.domain_events"); [[ "$age" != "ERR" ]] || { echo "❌ journal unreadable"; fail=1; }
if (( fail == 0 )); then notify "✅ restore drill ok — 8 schemas, journal partitioned, ${users} users, newest event ${age}s old"
else reported=1; notify "🚨 RESTORE DRILL FAILED — backups are not trustworthy. Investigate today." "${SEC_WEBHOOK:-}"; exit 1; fi
