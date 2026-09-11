#!/usr/bin/env bash
# Empty Ubuntu 24.04 → running production stack (+ optional staging). Idempotent.
#   curl -fsSL https://raw.githubusercontent.com/Nasalciuc/BBC-Club/main/infra/bootstrap.sh | sudo bash -s -- production
#   ... | sudo bash -s -- production --with-staging
set -Eeuo pipefail
trap 'echo "❌ bootstrap failed at line $LINENO" >&2' ERR
MODE="${1:-production}"; WITH_STAGING="${2:-}"
REPO="${REPO:-https://github.com/Nasalciuc/BBC-Club.git}"; REF="${REF:-main}"; APP_DIR="/opt/bbc"
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

say "5/9 code @ $REF"
if [[ -d "$APP_DIR/.git" ]]; then git -C "$APP_DIR" fetch -q --all && git -C "$APP_DIR" checkout -q "$REF" && git -C "$APP_DIR" pull -q --ff-only || true
else git clone -q --branch "$REF" "$REPO" "$APP_DIR"; fi
cd "$APP_DIR"

say "6/9 secrets"
ENV_FILE="$APP_DIR/infra/env/${MODE}.env"
if [[ ! -f "$ENV_FILE" ]]; then
  install -m 600 -o root -g root "$APP_DIR/infra/env/${MODE}.env.example" "$ENV_FILE"
  echo "⚠ created $ENV_FILE from the example — fill it in, then re-run: sudo bash infra/bootstrap.sh $MODE $WITH_STAGING"; exit 2
fi
chmod 600 "$ENV_FILE"; chown root:root "$ENV_FILE"
missing=(); for k in POSTGRES_PASSWORD BETTER_AUTH_SECRET INTERNAL_API_SECRET API_DOMAIN ACME_EMAIL API_IMAGE; do grep -qE "^${k}=.+" "$ENV_FILE" || missing+=("$k"); done
if [[ "$MODE" == "production" ]]; then for k in PGBACKREST_REPO1_S3_ENDPOINT PGBACKREST_REPO1_S3_BUCKET PGBACKREST_REPO1_S3_KEY PGBACKREST_REPO1_S3_KEY_SECRET PGBACKREST_REPO1_CIPHER_PASS; do grep -qE "^${k}=.+" "$ENV_FILE" || missing+=("$k"); done; fi
[[ ${#missing[@]} -eq 0 ]] || { echo "❌ missing in $ENV_FILE: ${missing[*]}"; exit 2; }
if [[ "$WITH_STAGING" == "--with-staging" && ! -f "$APP_DIR/infra/env/staging.env" ]]; then
  install -m 600 "$APP_DIR/infra/env/staging.env.example" "$APP_DIR/infra/env/staging.env"; echo "⚠ fill infra/env/staging.env and re-run"; exit 2
fi

say "7/9 host cron (backups, restore drill, disk check)"
install -m 644 "$APP_DIR/infra/host/crontab" /etc/cron.d/bbc

say "8/9 start"
DC="docker compose -f infra/docker-compose.yml -f infra/compose.prod.yml --env-file $ENV_FILE"
[[ "$WITH_STAGING" == "--with-staging" ]] && DC="$DC -f infra/compose.staging.yml"
export ENV_FILE
$DC build -q postgres
$DC pull -q --ignore-buildable
$DC up -d

say "9/9 waiting for api /ready"
for i in {1..60}; do
  if $DC exec -T api bun -e "fetch('http://localhost:8000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "✅ stack up ($MODE${WITH_STAGING:+ + staging})"; echo
    echo "next:"
    echo "  1. DNS: $(grep '^API_DOMAIN=' "$ENV_FILE" | cut -d= -f2-) → $(curl -s ifconfig.me) (Cloudflare proxied, Full strict)"
    echo "  2. migrations: $DC run --rm --no-deps api bun run --filter @bbc/db db:migrate"
    [[ "$MODE" == "production" ]] && echo "  3. backups: bash infra/pgbackrest-init.sh   then   bash infra/restore-test.sh"
    echo "  4. Uptime Kuma via tunnel: ssh -L 3001:uptime-kuma:3001 root@$(hostname) — add /health (1m) + /ready (5m)"
    echo "  5. put every secret in the company password manager"
    exit 0
  fi; sleep 5
done
echo "❌ /ready never went green — $DC logs api --tail 100"; exit 1
