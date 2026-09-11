#!/usr/bin/env bash
# Empty Ubuntu 24.04 → running production stack (+ optional staging). Idempotent.
#   curl -fsSL https://raw.githubusercontent.com/Nasalciuc/BBC-Club/main/isolated/infra-production-v2/infra-v2/infra/bootstrap.sh | sudo bash -s -- production
#   ... | sudo bash -s -- production --with-staging
# After the monorepo assembly this file lives at infra/bootstrap.sh — the URL changes, the script does not.
set -Eeuo pipefail
trap 'echo "❌ bootstrap failed at line $LINENO" >&2' ERR
MODE="${1:-production}"; WITH_STAGING="${2:-}"
REPO="${REPO:-https://github.com/Nasalciuc/BBC-Club.git}"; REF="${REF:-main}"
# Work from the script's own location so this works whether infra/ is at the repo root
# (after the monorepo assembly) or nested under isolated/ (today).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR"                       # …/infra
APP_DIR="$(cd "$INFRA_DIR/.." && pwd)"        # the directory that contains infra/
REPO_DIR="${REPO_DIR:-$(git -C "$APP_DIR" rev-parse --show-toplevel 2>/dev/null || echo /opt/bbc)}"
say() { echo -e "\n▶ $*"; }
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }
. /etc/os-release; [[ "${VERSION_ID:-}" == "24.04" ]] || echo "⚠ expected Ubuntu 24.04, found ${VERSION_ID:-?} — continuing"

say "1/9 packages"; export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq ca-certificates curl git ufw fail2ban unattended-upgrades jq

say "2/9 docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc; chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq && apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# global log rotation: covers `docker compose run --rm` containers that per-service options miss
cat > /etc/docker/daemon.json << 'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" }, "live-restore": true }
JSON
systemctl enable --now docker; systemctl restart docker

say "3/9 firewall + ssh hardening"
ufw --force reset >/dev/null; ufw default deny incoming >/dev/null; ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
(systemctl reload ssh 2>/dev/null || systemctl reload sshd) || true
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
timedatectl set-timezone UTC || true
sysctl -w vm.overcommit_memory=1 >/dev/null; grep -q overcommit /etc/sysctl.conf || echo 'vm.overcommit_memory=1' >> /etc/sysctl.conf

say "4/9 swap"
if ! swapon --show | grep -q .; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile; grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi

say "5/9 code @ $REF → $REPO_DIR"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" fetch --all
  git -C "$REPO_DIR" checkout "$REF"
  git -C "$REPO_DIR" pull --ff-only
else
  git clone --branch "$REF" "$REPO" "$REPO_DIR"
fi
# Re-derive after clone: nested snapshot today, repo-root infra/ after the monorepo assembly.
if [[ -f "$REPO_DIR/isolated/infra-production-v2/infra-v2/infra/docker-compose.yml" ]]; then
  INFRA_DIR="$REPO_DIR/isolated/infra-production-v2/infra-v2/infra"
elif [[ -f "$REPO_DIR/infra/docker-compose.yml" ]]; then
  INFRA_DIR="$REPO_DIR/infra"
else
  INFRA_DIR="$(dirname "$(find "$REPO_DIR" -maxdepth 4 -type f -name docker-compose.yml -path '*/infra/docker-compose.yml' | head -1)")"
  [[ -n "$INFRA_DIR" && -f "$INFRA_DIR/docker-compose.yml" ]] || { echo "❌ could not find infra/ in $REPO_DIR"; exit 1; }
fi
APP_DIR="$(cd "$INFRA_DIR/.." && pwd)"
cd "$APP_DIR"
echo "    REPO_DIR=$REPO_DIR"
echo "    APP_DIR=$APP_DIR"
echo "    INFRA_DIR=$INFRA_DIR"

say "6/9 secrets"
ENV_FILE="$INFRA_DIR/env/${MODE}.env"
if [[ ! -f "$ENV_FILE" ]]; then
  install -m 600 -o root -g root "$INFRA_DIR/env/${MODE}.env.example" "$ENV_FILE"
  echo "⚠ created $ENV_FILE from the example — fill it in, then re-run: sudo bash $INFRA_DIR/bootstrap.sh $MODE $WITH_STAGING"; exit 2
fi
chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
missing=(); for k in POSTGRES_PASSWORD BETTER_AUTH_SECRET INTERNAL_API_SECRET API_DOMAIN ACME_EMAIL API_IMAGE; do grep -qE "^${k}=.+" "$ENV_FILE" || missing+=("$k"); done
if [[ "$MODE" == "production" ]]; then for k in PGBACKREST_REPO1_S3_ENDPOINT PGBACKREST_REPO1_S3_BUCKET PGBACKREST_REPO1_S3_KEY PGBACKREST_REPO1_S3_KEY_SECRET PGBACKREST_REPO1_CIPHER_PASS; do grep -qE "^${k}=.+" "$ENV_FILE" || missing+=("$k"); done; fi
[[ ${#missing[@]} -eq 0 ]] || { echo "❌ missing in $ENV_FILE: ${missing[*]}"; exit 2; }
if [[ "$WITH_STAGING" == "--with-staging" ]]; then
  STG="$INFRA_DIR/env/staging.env"
  [[ -f "$STG" ]] || { install -m 600 "$INFRA_DIR/env/staging.env.example" "$STG"; echo "⚠ fill $STG and re-run"; exit 2; }
  chmod 600 "$STG"
  stg_missing=(); for k in POSTGRES_PASSWORD_STAGING BETTER_AUTH_SECRET INTERNAL_API_SECRET_STAGING API_IMAGE_STAGING APP_ORIGIN; do
    grep -qE "^${k}=.+" "$STG" || stg_missing+=("$k"); done
  [[ ${#stg_missing[@]} -eq 0 ]] || { echo "❌ missing in $STG: ${stg_missing[*]}"; exit 2; }
fi

say "7/9 host cron (backups, restore drill, disk check)"
sed "s|%APP_DIR%|$APP_DIR|g" "$INFRA_DIR/host/crontab" > /etc/cron.d/bbc
chmod 644 /etc/cron.d/bbc

say "8/9 start (database → migrations → API and ingress)"
DC="docker compose -f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/compose.prod.yml --env-file $ENV_FILE"
[[ "$WITH_STAGING" == "--with-staging" ]] && DC="$DC -f $INFRA_DIR/compose.staging.yml --env-file $INFRA_DIR/env/staging.env"
export ENV_FILE
$DC build -q postgres
$DC pull -q --ignore-buildable
$DC up -d postgres
for i in {1..30}; do $DC exec -T postgres pg_isready -U bbc -d bbc >/dev/null 2>&1 && break; sleep 2; done
$DC exec -T postgres pg_isready -U bbc -d bbc >/dev/null 2>&1 || { echo "❌ postgres never became ready"; exit 1; }
$DC run --rm --no-deps api bun run --filter @bbc/db db:migrate      # schema exists before anything serves traffic
$DC up -d

say "9/9 waiting for api /ready"
ready() { $DC exec -T "$1" bun -e "fetch('http://localhost:8000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; }
for i in {1..60}; do
  if ready api && { [[ "$WITH_STAGING" != "--with-staging" ]] || ready api-staging; }; then
    echo "✅ stack up ($MODE${WITH_STAGING:+ + staging})"; echo
    echo "next:"
    echo "  1. DNS: $(grep '^API_DOMAIN=' "$ENV_FILE" | cut -d= -f2-) → $(curl -s ifconfig.me) (Cloudflare proxied, Full strict)"
    [[ "$MODE" == "production" ]] && echo "  2. backups: bash $INFRA_DIR/pgbackrest-init.sh   then   bash $INFRA_DIR/restore-test.sh"
    echo "  3. Uptime Kuma via tunnel: ssh -L 3001:uptime-kuma:3001 root@$(hostname) — add /health (1m) + /ready (5m)"
    echo "  4. put every secret in the company password manager"
    exit 0
  fi
  sleep 5
done
echo "❌ /ready never went green — $DC logs api --tail 100"; exit 1
