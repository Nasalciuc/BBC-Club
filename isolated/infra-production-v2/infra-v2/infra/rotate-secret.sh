#!/usr/bin/env bash
# Double-window rotation: <KEY>_NEXT is accepted alongside <KEY>; after consumers move, promote.
#   bash infra/rotate-secret.sh production INTERNAL_API_SECRET
#   bash infra/rotate-secret.sh production INTERNAL_API_SECRET --promote
set -Eeuo pipefail
MODE="${1:?}"; KEY="${2:?}"; ACTION="${3:-}"
[[ "$KEY" =~ ^[A-Z][A-Z0-9_]{2,63}$ ]] || { echo "❌ KEY must be an env identifier (A-Z, 0-9, _): got '$KEY'"; exit 1; }
[[ "$MODE" =~ ^(production|staging)$ ]] || { echo "❌ MODE must be production or staging"; exit 1; }
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
ENV_FILE="$INFRA_DIR/env/${MODE}.env"
[[ -f "$ENV_FILE" ]] || { echo "no $ENV_FILE"; exit 1; }
if [[ "$ACTION" == "--promote" ]]; then
  NEXT=$(grep -E "^${KEY}_NEXT=" "$ENV_FILE" | cut -d= -f2-); [[ -n "$NEXT" ]] || { echo "no ${KEY}_NEXT"; exit 1; }
  sed -i "s|^${KEY}=.*|${KEY}=${NEXT}|; /^${KEY}_NEXT=/d" "$ENV_FILE"
  echo "✅ ${KEY} promoted. Restart: docker compose ... up -d api"
else
  NEW=$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)
  grep -qE "^${KEY}_NEXT=" "$ENV_FILE" && sed -i "s|^${KEY}_NEXT=.*|${KEY}_NEXT=${NEW}|" "$ENV_FILE" || echo "${KEY}_NEXT=${NEW}" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "${KEY}_NEXT set; API accepts both after restart. Update consumers, store in the password manager, then --promote."
fi
