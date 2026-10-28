# Shared by the infra scripts. Answers one question about an env file: what is KEY's value, as Compose would read it?
# Grammar — docs.docker.com, "Set, use, and manage variables in a Compose file with interpolation", ".env file syntax":
#   KEY=VAL · KEY = VAL · KEY: VAL — the last assignment wins; CR line endings are dropped.
#   Unquoted: a "#" after whitespace starts a comment ("VAL # c" → VAL); "VAL#x" keeps the "#".
#   "Double-quoted": backslash escapes; "VAL # x" keeps the text; "VAL" # c → VAL.
#   'Single-quoted': literal, and may span several lines.
# Fail closed: where Compose would interpolate ($ in an unquoted or double-quoted value), or where the line uses a form Docker does not
# document (an "export " prefix, an unterminated double quote), the value is ENV_VALUE_UNKNOWN — non-empty on purpose. Callers treat it
# as "set": the redis-kafka profile turns on, and guard_staging refuses. A required setting (env_known) treats it as missing; an
# optional one (env_optional) as unset, and says so on stderr.
#
# shellcheck shell=bash

ENV_VALUE_UNKNOWN="<unresolved: check this line by hand>"
# What env_value prints, given as its third argument, when the file never assigns KEY (compose_value tells "absent" from
# "assigned nothing" this way: Compose does too).
ENV_VALUE_ABSENT="<absent>"

env_value() {
  local file="$1" key="$2"
  local line name gap rest val="${3-}" ml="" mlbuf="" inner i c esc
  [[ -f "$file" ]] || { printf '%s' "$val"; return 0; }
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

# A required setting holds a real value: non-empty, resolved by this parser, and not an unfilled template line. Compose reads
# "KEY=      # hint" as the value "# hint", so a value that starts with "#" counts as not filled in.
env_known() {
  local v
  v="$(env_value "$1" "$2")"
  [[ -n "$v" && "$v" != "$ENV_VALUE_UNKNOWN" && "$v" != "#"* ]]
}

# An optional setting, such as a webhook: its value, or nothing when it is not filled in or cannot be read. An unreadable line
# says so on stderr, so an alert that goes quiet never goes quiet silently.
env_optional() {
  local v
  v="$(env_value "$1" "$2")"
  if [[ "$v" == "$ENV_VALUE_UNKNOWN" ]]; then
    echo "⚠ $2 in $1 could not be read — check that line by hand; it is treated as unset" >&2
    v=""
  elif [[ "$v" == "#"* ]]; then
    v=""
  fi
  printf '%s' "$v"
}

# What Compose substitutes for ${KEY:-DEFAULT} when it runs with --env-file for each FILE, in that order: the shell's
# value first, then the last file that assigns KEY (an empty assignment blanks an earlier one), then DEFAULT. deploy.sh
# reads API_REPLICAS this way, so the count it scales to is the count the compose files ask for.
compose_value() {
  local key="$1" def="$2" file v="" w
  shift 2
  if [[ -n "${!key+x}" ]]; then
    v="${!key}"
  else
    for file in "$@"; do
      [[ -n "$file" ]] || continue
      w="$(env_value "$file" "$key" "$ENV_VALUE_ABSENT")"
      [[ "$w" == "$ENV_VALUE_ABSENT" ]] || v="$w"
    done
  fi
  printf '%s' "${v:-$def}"
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

# GlitchTip (four containers, ~1,6 GB) runs only when production asks for it: GLITCHTIP=on.
glitchtip_wanted() {
  [[ "$(env_optional "$1" GLITCHTIP)" == "on" ]]
}

# The monitoring (VictoriaMetrics, Grafana, node-exporter, cAdvisor; 736 MB) runs only when production asks for it:
# MONITORING=on (ADR-IMPL-073). Grafana then needs GRAFANA_ADMIN_PASSWORD, and GRAFANA_ALERTS_WEBHOOK for its alerts.
monitoring_wanted() {
  [[ "$(env_optional "$1" MONITORING)" == "on" ]]
}

# Grafana's database dashboard reads Postgres as bbc_monitor (0052, ADR-IMPL-077): the role takes its password from the
# env file's GRAFANA_PG_PASSWORD through psql's stdin — never on a command line, never in a migration, nor in the log,
# nor in pg_stat_statements: the session first stops Postgres logging every statement it runs (log_statement, should
# anyone set it to ddl or all for a while), a failed or slow one (an ALTER that fails, the role not there yet, would be
# logged whole, password and all) and recording utility statements (a successful one would be kept word for word, where
# the dashboard's own role reads). bbc is the superuser, so it may set all four. deploy.sh (step 8) and bootstrap.sh
# (after the migrations) call it, production only.
#   set_monitor_password <env file> <compose command…>
set_monitor_password() {
  local env="$1" pw
  shift
  env_known "$env" GRAFANA_PG_PASSWORD || return 1
  pw="$(env_value "$env" GRAFANA_PG_PASSWORD)"
  printf "SET log_statement = 'none';\nSET log_min_error_statement = panic;\nSET log_min_duration_statement = -1;\nSET pg_stat_statements.track_utility = off;\nALTER ROLE bbc_monitor LOGIN PASSWORD '%s';\n" "${pw//\'/\'\'}" \
    | "$@" exec -T postgres psql -q -v ON_ERROR_STOP=1 -U bbc -d bbc >/dev/null
}

# Each Postgres service (postgres, postgres-staging) whose running container's command line is not the one the compose
# files give it now, one a line (ADR-IMPL-077): Postgres reads its -c settings only when its container is made, and a
# deploy never makes it again. A service these files do not have, or not running, is left out; without jq, nothing is
# compared, and stderr says so.
#   stale_postgres <compose command…>
stale_postgres() {
  local config svc ct wanted running
  command -v jq >/dev/null || { echo "⚠ jq not found: Postgres's settings were not compared with compose" >&2; return 0; }
  config="$("$@" config --format json 2>/dev/null)" || return 0
  for svc in postgres postgres-staging; do
    wanted="$(jq -c --arg s "$svc" '.services[$s].command // empty' <<<"$config")" || continue
    [[ -n "$wanted" ]] || continue
    ct="$("$@" ps -q "$svc" 2>/dev/null)" || continue
    [[ -n "$ct" ]] || continue
    running="$(docker inspect -f '{{json .Args}}' "$ct" 2>/dev/null | jq -c .)" || continue
    [[ "$running" == "$wanted" ]] || echo "$svc"
  done
}

# Whether a file under <dir> was changed after <time> (a container's .State.StartedAt, RFC 3339): Grafana reads its
# provisioning only when it starts, so a deploy restarts it when one of those files is newer (ADR-IMPL-073).
#   changed_since <dir> <time>
changed_since() {
  [[ -n "${2:-}" ]] || return 1
  [[ -n "$(find "$1" -type f -newermt "$2" -print -quit 2>/dev/null)" ]]
}

# MinIO runs again when production asks for it, for R1b's offer photography: MEDIA=on (ADR-IMPL-073). Off, nothing
# reads it (ADR-IMPL-047) and its 256 MB go to the monitoring.
media_wanted() {
  [[ "$(env_optional "$1" MEDIA)" == "on" ]]
}

# ORIGIN_TLS=on: Caddy serves the Cloudflare Origin CA certificate from ORIGIN_CERT_DIR (RUNBOOK § Certificates) and will
# not start without it, so this runs before anything restarts: both files there, the key readable by its owner only and
# matching the certificate, not expired, and naming each domain Caddy serves; under 30 days left is a warning. Each
# setting is read the way Compose hands it to Caddy (compose_value): the shell, then the env files. Caddy reads ORIGIN_TLS
# exactly as written (a comment after an empty value is the value), so anything but on or off stops here.
origin_tls_check() {
  local env="$1" stg="${2:-}" on dir cert key mode d
  dir="$(compose_value ORIGIN_CERT_DIR /etc/bbc/origin "$env" "$stg")"
  [[ "$dir" == /* ]] || { echo "❌ ORIGIN_CERT_DIR must be an absolute path (got: $dir)" >&2; return 1; }
  on="$(compose_value ORIGIN_TLS off "$env" "$stg")"
  case "$on" in
    off) return 0 ;;
    on) ;;
    *) echo "❌ ORIGIN_TLS must be on or off, with any comment on its own line (Caddy would read: $on)" >&2; return 1 ;;
  esac
  cert="$dir/cert.pem"
  key="$dir/key.pem"
  [[ -f "$cert" && -f "$key" ]] || { echo "❌ ORIGIN_TLS=on, but $cert or $key is missing (RUNBOOK § Certificates)" >&2; return 1; }
  mode="$(stat -c %a "$key")"
  (( (8#$mode & 8#077) == 0 )) || { echo "❌ $key must be readable by its owner only: chmod 600 $key" >&2; return 1; }
  openssl x509 -in "$cert" -noout -checkend 0 >/dev/null 2>&1 ||
    { echo "❌ $cert has expired, or does not read as a certificate" >&2; return 1; }
  # A warning, not a stop: a deploy that rolls back must still run while a renewal is on its way.
  openssl x509 -in "$cert" -noout -checkend 2592000 >/dev/null 2>&1 ||
    echo "⚠ $cert expires within 30 days: renew it (RUNBOOK § Certificates)" >&2
  [[ "$(openssl x509 -in "$cert" -noout -pubkey 2>/dev/null | sha256sum)" == "$(openssl pkey -in "$key" -pubout 2>/dev/null | sha256sum)" ]] ||
    { echo "❌ $key is not the key of $cert" >&2; return 1; }
  for d in "$(compose_value API_DOMAIN "" "$env" "$stg")" "$(compose_value API_DOMAIN_STAGING "" "$env" "$stg")"; do
    [[ -z "$d" ]] && continue
    openssl x509 -in "$cert" -noout -checkhost "$d" 2>/dev/null | grep -q " does match " ||
      { echo "❌ $cert does not cover $d" >&2; return 1; }
  done
}

# Staging shares redis-app and kafka. A resolved value here is a hard stop. So is any key that production's services read
# from the env files, given as the compose files after the env file (each ${KEY} in them): every --env-file feeds one
# namespace and staging.env comes last, so its value would replace production.env's — cron's INTERNAL_API_SECRET, MinIO's
# password, Caddy's settings. Staging's own values have names of their own (…_STAGING), set in compose.staging.yml.
guard_staging() {
  local stg="$1" url brokers pass k shadow=()
  shift
  [[ -n "$stg" && -f "$stg" ]] || return 0
  url="$(env_value "$stg" REDIS_URL)"
  brokers="$(env_value "$stg" KAFKA_BROKERS)"
  pass="$(env_value "$stg" REDIS_APP_PASSWORD)"
  if [[ -n "$url" || -n "$brokers" || -n "$pass" ]]; then
    echo "❌ staging shares redis-app and kafka with production and has no key or topic isolation — leave REDIS_URL, KAFKA_BROKERS and REDIS_APP_PASSWORD unset in staging.env (ADR-IMPL-029)." >&2
    exit 1
  fi
  for k in $(grep -ho '\${[A-Za-z_][A-Za-z0-9_]*' "$@" 2>/dev/null | cut -c3- | sort -u); do
    [[ "$(env_value "$stg" "$k" "$ENV_VALUE_ABSENT")" == "$ENV_VALUE_ABSENT" ]] || shadow+=("$k")
  done
  if (( ${#shadow[@]} > 0 )); then
    echo "❌ $stg sets ${shadow[*]}: production's services read the same name, and staging.env, the last env file, would give them staging's value. Remove those lines from staging.env (RUNBOOK § Staging on the same box)." >&2
    exit 1
  fi
}
