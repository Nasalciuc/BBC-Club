# Shared by bootstrap.sh and deploy.sh. Answers one question about an env file: is KEY set to a non-empty value, as Compose would read it?
# Grammar — docs.docker.com, "Set, use, and manage variables in a Compose file with interpolation", ".env file syntax":
#   KEY=VAL · KEY = VAL · KEY: VAL — the last assignment wins; CR line endings are dropped.
#   Unquoted: a "#" after whitespace starts a comment ("VAL # c" → VAL); "VAL#x" keeps the "#".
#   "Double-quoted": backslash escapes; "VAL # x" keeps the text; "VAL" # c → VAL.
#   'Single-quoted': literal, and may span several lines.
# Fail closed: where Compose would interpolate ($ in an unquoted or double-quoted value), or where the line uses a form Docker does not
# document (an "export " prefix, an unterminated double quote), the value is ENV_VALUE_UNKNOWN — non-empty on purpose. Callers treat it
# as "set": the redis-kafka profile turns on, and guard_staging refuses.
#
# shellcheck shell=bash

ENV_VALUE_UNKNOWN="<unresolved: check this line by hand>"

env_value() {
  local file="$1" key="$2"
  local line name gap rest val="" ml="" mlbuf="" inner i c esc
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ -n "$ml" ]]; then # inside a multi-line single-quoted value
      if [[ "$line" == *"'"* ]]; then
        mlbuf+=$'\n'"${line%%\'*}"
        if [[ "$ml" == "$key" ]]; then val="$mlbuf"; fi
        ml=""
        mlbuf=""
      else
        mlbuf+=$'\n'"$line"
      fi
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]*(#|$) ]]; then continue; fi
    if [[ "$line" =~ ^[[:space:]]*export[[:space:]]+([A-Za-z_][A-Za-z0-9_.-]*) ]]; then
      if [[ "${BASH_REMATCH[1]}" == "$key" ]]; then val="$ENV_VALUE_UNKNOWN"; fi
      continue
    fi
    if ! [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_.-]*)[[:space:]]*[=:]([[:space:]]*)(.*)$ ]]; then continue; fi
    name="${BASH_REMATCH[1]}"
    gap="${BASH_REMATCH[2]}"
    rest="${BASH_REMATCH[3]}"
    if [[ "$rest" == \'* ]]; then
      rest="${rest:1}"
      if [[ "$rest" == *"'"* ]]; then
        if [[ "$name" == "$key" ]]; then val="${rest%%\'*}"; fi
      else
        ml="$name"
        mlbuf="$rest"
      fi
      continue
    fi
    [[ "$name" == "$key" ]] || continue
    if [[ "$rest" == \"* ]]; then
      inner=""
      esc=""
      c=""
      for ((i = 1; i < ${#rest}; i++)); do
        c="${rest:i:1}"
        if [[ -n "$esc" ]]; then inner+="$c"; esc=""; continue; fi
        if [[ "$c" == "\\" ]]; then esc=1; continue; fi
        if [[ "$c" == '"' ]]; then break; fi
        inner+="$c"
      done
      if [[ "$c" != '"' || "$inner" == *'$'* ]]; then
        val="$ENV_VALUE_UNKNOWN"
      else
        val="$inner"
      fi
      continue
    fi
    if [[ "$rest" == \#* && -z "$gap" ]]; then # "KEY=#x" is not documented
      val="$ENV_VALUE_UNKNOWN"
      continue
    fi
    # Trim first. Compose does, so "KEY=        # off" is the value "# off", not unset.
    rest="${rest#"${rest%%[![:space:]]*}"}"
    rest="${rest%"${rest##*[![:space:]]}"}"
    rest="${rest%%[[:space:]]#*}"
    rest="${rest%"${rest##*[![:space:]]}"}"
    if [[ "$rest" == *'$'* ]]; then val="$ENV_VALUE_UNKNOWN"; else val="$rest"; fi
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
