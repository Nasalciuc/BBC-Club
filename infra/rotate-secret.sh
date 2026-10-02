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
# shellcheck disable=SC1091
source "$INFRA_DIR/env-value.sh"
if [[ "$ACTION" == "--promote" ]]; then
  # Read as Compose reads it, then refuse anything this script did not generate: empty quotes, a template line, a value the
  # parser cannot read, or characters that would break the sed below. The secret itself is never printed.
  NEXT="$(env_value "$ENV_FILE" "${KEY}_NEXT")"
  [[ "$NEXT" =~ ^[A-Za-z0-9._~-]+$ ]] || { echo "❌ ${KEY}_NEXT is missing, unreadable, or not one this script generated — run: bash $0 $MODE $KEY"; exit 1; }
  sed -i "s|^${KEY}=.*|${KEY}=${NEXT}|; /^${KEY}_NEXT=/d" "$ENV_FILE"
  echo "✅ ${KEY} promoted. Restart: docker compose ... up -d api"
else
  NEW=$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)
  grep -qE "^${KEY}_NEXT=" "$ENV_FILE" && sed -i "s|^${KEY}_NEXT=.*|${KEY}_NEXT=${NEW}|" "$ENV_FILE" || echo "${KEY}_NEXT=${NEW}" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "${KEY}_NEXT set; API accepts both after restart. Update consumers, store in the password manager, then --promote."
fi
