#!/usr/bin/env bash
# Double-window rotation: <KEY>_NEXT is accepted alongside <KEY>; after consumers move, promote.
#   bash infra/rotate-secret.sh production INTERNAL_API_SECRET
#   bash infra/rotate-secret.sh production INTERNAL_API_SECRET --promote
set -Eeuo pipefail
MODE="${1:?}"; KEY="${2:?}"; ACTION="${3:-}"; ENV_FILE="${APP_DIR:-/opt/bbc}/infra/env/${MODE}.env"
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
