#!/usr/bin/env bash
#
# Deploy por rsync + SSH → produção. Não envia .env do repositório.
#
#   export BRSPARK_SSH_KEY="$HOME/Downloads/alex.pem"
<<<<<<< HEAD
#   ./scripts/deploy-production.sh all|api|web
#
# SKIP_PRISMA_MIGRATE=1 api   |   SKIP_LARAVEL_MIGRATE=1 web
#
set -euo pipefail
SKIP_PRISMA_MIGRATE="${SKIP_PRISMA_MIGRATE:-0}"
RUN_LARAVEL_MIGRATE="${RUN_LARAVEL_MIGRATE:-1}"
=======
#   ./scripts/deploy-production.sh api          # só painel Node (admin-panel)
#   ./scripts/deploy-production.sh web          # só Laravel (requer pasta BrsparkWeb)
#   ./scripts/deploy-production.sh all          # api + web
#   SKIP_LARAVEL_MIGRATE=1 ... web   # não corre php artisan migrate --force
#   SKIP_PRISMA_MIGRATE=1 ... api    # emergência: não corre Prisma migrate
#
set -euo pipefail

# Prisma: script com retry/resolve (P3009) em admin-panel/backend/scripts/prisma-migrate-deploy-production.sh
SKIP_PRISMA_MIGRATE="${SKIP_PRISMA_MIGRATE:-0}"
# Laravel: por omissão aplica migrações em produção
RUN_LARAVEL_MIGRATE="${RUN_LARAVEL_MIGRATE:-1}"

>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
TARGET="${1:-all}"
SSH_KEY="${BRSPARK_SSH_KEY:-$HOME/Downloads/alex.pem}"
SSH_HOST="${BRSPARK_SSH_HOST:-3.149.14.138}"
SSH_USER="${BRSPARK_SSH_USER:-ubuntu}"
REMOTE_API="${BRSPARK_REMOTE_API:-/var/www/brspark-api}"
REMOTE_WEB="${BRSPARK_REMOTE_WEB:-/var/www/brspark-web}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ADMIN_LOCAL="$MOBILE_ROOT/admin-panel"
WEB_LOCAL="${BRSPARK_WEB_LOCAL:-"$(cd "$MOBILE_ROOT/../BrsparkWeb/backend" 2>/dev/null && pwd || echo "")"}"

[[ -f "$SSH_KEY" ]] || { echo "[deploy] Defina BRSPARK_SSH_KEY" >&2; exit 1; }

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
RSYNC_RSH="ssh ${SSH_OPTS[*]}"

RSYNC_COMMON=(
  -avz --delete
  --exclude '.env' --exclude '.env.*' --exclude 'node_modules' --exclude '.git'
  --exclude '.DS_Store' --exclude '*.log' --exclude 'backups/**'
  --exclude 'backend/public/uploads/**'
)

# Laravel: -rlvz em vez de -avz — no servidor storage/bootstrap pertencem a www-data;
# sem preservar -p/-o/-g o rsync não falha com "Operation not permitted" (exit 23).
RSYNC_LARAVEL=(
  -rlvz --delete --omit-dir-times
  --exclude '.env' --exclude '.env.*' --exclude 'vendor' --exclude 'node_modules'
  --exclude '.git' --exclude '.DS_Store'
  --exclude 'storage/logs/**'
  --exclude 'storage/framework/cache/**'
  --exclude 'storage/framework/sessions/**'
  --exclude 'storage/framework/views/**'
  --exclude 'bootstrap/cache/*.php'
)

deploy_api() {
  [[ -d "$ADMIN_LOCAL" ]] || exit 1
  echo "[deploy] Rsync admin-panel → ${SSH_USER}@${SSH_HOST}:${REMOTE_API}/"
  rsync "${RSYNC_COMMON[@]}" -e "$RSYNC_RSH" \
    "$ADMIN_LOCAL/" "${SSH_USER}@${SSH_HOST}:${REMOTE_API}/"

<<<<<<< HEAD
  echo "[deploy] npm + prisma + generate + pm2 …"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    env REMOTE_API="$REMOTE_API" SKIP_PRISMA_MIGRATE="$SKIP_PRISMA_MIGRATE" bash -s << 'REMOTE'
=======
  echo "[deploy] npm + prisma migrate (auto-retry) + generate + pm2 no servidor…"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    env REMOTE_API="$REMOTE_API" SKIP_PRISMA_MIGRATE="$SKIP_PRISMA_MIGRATE" \
    bash -s << 'REMOTE'
>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
set -e
cd "$REMOTE_API/backend"
export NODE_ENV=production
npm ci --omit=dev
PR_EC=0
if [[ "$SKIP_PRISMA_MIGRATE" != "1" ]]; then
  bash scripts/prisma-migrate-deploy-production.sh || PR_EC=$?
else
<<<<<<< HEAD
  echo "[deploy] Prisma migrate ignorado (SKIP_PRISMA_MIGRATE)"
=======
  echo "[deploy] SKIP_PRISMA_MIGRATE=1 — Prisma migrate ignorado"
>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
fi
npx prisma generate
pm2 restart brspark-api
exit "${PR_EC:-0}"
REMOTE
  echo "[deploy] API concluído."
}

deploy_web() {
  [[ -n "$WEB_LOCAL" && -d "$WEB_LOCAL" ]] || { echo "[deploy] Falta BrsparkWeb/backend (defina BRSPARK_WEB_LOCAL)." >&2; exit 1; }
  echo "[deploy] Rsync Laravel → ${SSH_USER}@${SSH_HOST}:${REMOTE_WEB}/"
  rsync "${RSYNC_LARAVEL[@]}" -e "$RSYNC_RSH" \
    "$WEB_LOCAL/" "${SSH_USER}@${SSH_HOST}:${REMOTE_WEB}/"

<<<<<<< HEAD
  echo "[deploy] permissões + composer + migrate + cache Laravel …"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    env REMOTE_WEB="$REMOTE_WEB" RUN_LARAVEL_MIGRATE="$RUN_LARAVEL_MIGRATE" bash -s << 'REMOTE'
=======
  echo "[deploy] composer + migrate + cache Laravel no servidor…"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" bash << REMOTE
>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
set -e
sudo chown -R ubuntu:www-data "$REMOTE_WEB/storage" "$REMOTE_WEB/bootstrap/cache" "$REMOTE_WEB/storage/logs" 2>/dev/null || true
chmod -R ug+rwX "$REMOTE_WEB/storage" "$REMOTE_WEB/bootstrap/cache" 2>/dev/null || true
cd "$REMOTE_WEB"
composer install --no-dev --optimize-autoloader --no-interaction
<<<<<<< HEAD
if [[ "$RUN_LARAVEL_MIGRATE" == "1" ]]; then
  php artisan migrate --force
=======
if [[ "${RUN_LARAVEL_MIGRATE}" == "1" ]]; then
  echo "[deploy] php artisan migrate --force …"
  php artisan migrate --force
else
  echo "[deploy] RUN_LARAVEL_MIGRATE≠1 — migrate Laravel ignorado"
>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
fi
php artisan config:cache
php artisan route:cache
php artisan view:cache
REMOTE
<<<<<<< HEAD
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    "sudo chown -R ubuntu:www-data ${REMOTE_WEB}/storage ${REMOTE_WEB}/bootstrap/cache 2>/dev/null || true"
  echo "[deploy] Laravel concluído."
=======
  sudo_cmd="sudo chown -R ubuntu:www-data ${REMOTE_WEB}/storage ${REMOTE_WEB}/bootstrap/cache 2>/dev/null || true"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" "$sudo_cmd"

  echo "[deploy] Laravel (brspark-web) concluído."
>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
}

case "$TARGET" in
  api) deploy_api ;;
  web) deploy_web ;;
  all) deploy_api; deploy_web ;;
  *) echo "Uso: $0 api|web|all" >&2; exit 1 ;;
esac
