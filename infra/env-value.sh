# Shared by bootstrap.sh and deploy.sh. A non-interpolated env file value:
# the last assignment wins; an unquoted " #" starts a comment; surrounding
# whitespace and one pair of quotes are dropped. Empty means unset.
#
# shellcheck shell=bash

env_value() {
  local file="$1" key="$2"
  local line lhs rest val=""
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" == *=* ]] || continue
    lhs="${line%%=*}"
    lhs="${lhs#"${lhs%%[![:space:]]*}"}"
    lhs="${lhs%"${lhs##*[![:space:]]}"}"
    [[ "$lhs" == "$key" ]] || continue
    rest="${line#*=}"
    if [[ "$rest" == \"* ]]; then
      rest="${rest:1}"
      rest="${rest%%\"*}"
    elif [[ "$rest" == \'* ]]; then
      rest="${rest:1}"
      rest="${rest%%\'*}"
    else
      rest="${rest%% #*}"
      rest="${rest#"${rest%%[![:space:]]*}"}"
      rest="${rest%"${rest##*[![:space:]]}"}"
      if [[ ${#rest} -ge 2 && ( "$rest" == \"*\" || "$rest" == \'*\' ) ]]; then
        local n=$((${#rest} - 2))
        rest="${rest:1:n}"
      fi
    fi
    val="$rest"
  done < "$file"
  printf '%s' "$val"
}

# Profile on when production, or an attached staging file, has a real URL or broker list.
redis_kafka_wanted() {
  local prod="$1" stg="${2:-}" v
  v="$(env_value "$prod" REDIS_URL)"
  [[ -n "$v" ]] && return 0
  v="$(env_value "$prod" KAFKA_BROKERS)"
  [[ -n "$v" ]] && return 0
  if [[ -n "$stg" ]]; then
    v="$(env_value "$stg" REDIS_URL)"
    [[ -n "$v" ]] && return 0
    v="$(env_value "$stg" KAFKA_BROKERS)"
    [[ -n "$v" ]] && return 0
  fi
  return 1
}

# Staging shares redis-app and kafka. A resolved value here is a hard stop.
guard_staging() {
  local stg="$1" url brokers pass
  [[ -n "$stg" && -f "$stg" ]] || return 0
  url="$(env_value "$stg" REDIS_URL)"
  brokers="$(env_value "$stg" KAFKA_BROKERS)"
  pass="$(env_value "$stg" REDIS_APP_PASSWORD)"
  if [[ -n "$url" || -n "$brokers" || -n "$pass" ]]; then
    echo "❌ staging shares redis-app and kafka with production and has no key or topic isolation — leave REDIS_URL, KAFKA_BROKERS and REDIS_APP_PASSWORD unset in staging.env (ADR-IMPL-029)." >&2
    exit 1
  fi
}
