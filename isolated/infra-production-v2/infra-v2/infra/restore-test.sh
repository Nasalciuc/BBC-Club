#!/usr/bin/env bash
# Monthly drill: restore the latest backup into a THROWAWAY container built from the SAME postgres image
# (same uid → no permission surprises), assert the shape, report, destroy.
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/opt/bbc}"; cd "$APP_DIR"
ENV_FILE="$APP_DIR/infra/env/production.env"
source <(grep -E '^(OPS_WEBHOOK|SEC_WEBHOOK)=' "$ENV_FILE" || true)
notify() { local hook="${2:-$OPS_WEBHOOK}"; [[ -n "${hook:-}" ]] && curl -fsS -X POST "$hook" -H 'Content-Type: application/json' -d "{\"text\":\"$1\"}" >/dev/null || true; echo "$1"; }
STAMP=$(date +%Y%m%d-%H%M%S); VOL="bbc_restoretest_$STAMP"; CT="bbc-restoretest-$STAMP"
cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; docker volume rm "$VOL" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ restore latest backup into $VOL (image bbc-postgres:16, pgbackrest env from production.env)"
docker volume create "$VOL" >/dev/null
docker run --rm --env-file "$ENV_FILE" -e PGBACKREST_STANZA=bbc -u postgres -v "$VOL:/var/lib/postgresql/data" bbc-postgres:16 \
  pgbackrest --stanza=bbc --delta --archive-mode=off restore
docker run -d --name "$CT" --env-file "$ENV_FILE" -e POSTGRES_PASSWORD=unused -v "$VOL:/var/lib/postgresql/data" bbc-postgres:16 \
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
else notify "🚨 RESTORE DRILL FAILED — backups are not trustworthy. Investigate today." "${SEC_WEBHOOK:-}"; exit 1; fi
