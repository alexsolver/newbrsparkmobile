#!/usr/bin/env bash
#
# Deploy por rsync + SSH → produção. Não envia .env do repositório.
#
#   export BRSPARK_SSH_KEY="$HOME/Downloads/alex.pem"
#   ./scripts/deploy-production.sh api          # só painel Node (admin-panel)
#   ./scripts/deploy-production.sh web          # só Laravel (requer pasta BrsparkWeb)
#   ./scripts/deploy-production.sh all          # api + web
#   SKIP_LARAVEL_MIGRATE=1 ... web   # não corre php artisan migrate --force
#   SKIP_PRISMA_MIGRATE=1 ... api    # emergência: não corre Prisma migrate
#   SKIP_FRONTEND_BUILD=1 ... web   # não corre npm run build (só PHP/backend public)
#
set -euo pipefail

# Prisma: script com retry/resolve (P3009) em admin-panel/backend/scripts/prisma-migrate-deploy-production.sh
SKIP_PRISMA_MIGRATE="${SKIP_PRISMA_MIGRATE:-0}"
# Laravel: por omissão aplica migrações em produção
RUN_LARAVEL_MIGRATE="${RUN_LARAVEL_MIGRATE:-1}"
# BrsparkWeb: por omissão faz vite build e copia dist → backend/public (index.html + assets)
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-0}"

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

  echo "[deploy] npm + prisma migrate (auto-retry) + generate + pm2 no servidor…"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    env REMOTE_API="$REMOTE_API" SKIP_PRISMA_MIGRATE="$SKIP_PRISMA_MIGRATE" \
    bash -s << 'REMOTE'
set -e
cd "$REMOTE_API/backend"
export NODE_ENV=production
npm ci --omit=dev
PR_EC=0
if [[ "$SKIP_PRISMA_MIGRATE" != "1" ]]; then
  bash scripts/prisma-migrate-deploy-production.sh || PR_EC=$?
else
  echo "[deploy] SKIP_PRISMA_MIGRATE=1 — Prisma migrate ignorado"
fi
npx prisma generate
pm2 restart brspark-api
exit "${PR_EC:-0}"
REMOTE
  echo "[deploy] API concluído."
}

# Garante public/index.html e assets do React (BrsparkWeb/frontend) antes do rsync — sem isto o Laravel serve resources/views/welcome.
build_brspark_web_frontend() {
  local FRONTEND_LOCAL
  FRONTEND_LOCAL="$(cd "$WEB_LOCAL/../frontend" 2>/dev/null && pwd)" || FRONTEND_LOCAL=""
  if [[ "${SKIP_FRONTEND_BUILD}" == "1" ]]; then
    echo "[deploy] SKIP_FRONTEND_BUILD=1 — build do frontend ignorado"
    return 0
  fi
  if [[ ! -d "$FRONTEND_LOCAL" || ! -f "$FRONTEND_LOCAL/package.json" ]]; then
    echo "[deploy] Aviso: pasta BrsparkWeb/frontend em falta — public/index.html não será gerado aqui." >&2
    return 0
  fi
  echo "[deploy] npm ci + npm run build (BrsparkWeb frontend)…"
  (cd "$FRONTEND_LOCAL" && npm ci && npm run build)
  echo "[deploy] Copiar frontend/dist → ${WEB_LOCAL}/public/ (SPA)…"
  mkdir -p "$WEB_LOCAL/public/assets"
  rsync -a --delete "$FRONTEND_LOCAL/dist/assets/" "$WEB_LOCAL/public/assets/"
  if [[ -d "$FRONTEND_LOCAL/dist/locales" ]]; then
    mkdir -p "$WEB_LOCAL/public/locales"
    rsync -a --delete "$FRONTEND_LOCAL/dist/locales/" "$WEB_LOCAL/public/locales/"
  fi
  rsync -a "$FRONTEND_LOCAL/dist/" "$WEB_LOCAL/public/" \
    --exclude assets --exclude locales --exclude '.DS_Store'
}

deploy_web() {
  [[ -n "$WEB_LOCAL" && -d "$WEB_LOCAL" ]] || { echo "[deploy] Falta BrsparkWeb/backend (defina BRSPARK_WEB_LOCAL)." >&2; exit 1; }
  build_brspark_web_frontend
  echo "[deploy] Rsync Laravel → ${SSH_USER}@${SSH_HOST}:${REMOTE_WEB}/"
  rsync "${RSYNC_LARAVEL[@]}" -e "$RSYNC_RSH" \
    "$WEB_LOCAL/" "${SSH_USER}@${SSH_HOST}:${REMOTE_WEB}/"

  echo "[deploy] permissões + composer + migrate + cache Laravel no servidor…"
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    env REMOTE_WEB="$REMOTE_WEB" RUN_LARAVEL_MIGRATE="$RUN_LARAVEL_MIGRATE" bash -s << 'REMOTE'
set -e
sudo chown -R ubuntu:www-data "$REMOTE_WEB/storage" "$REMOTE_WEB/bootstrap/cache" "$REMOTE_WEB/storage/logs" 2>/dev/null || true
chmod -R ug+rwX "$REMOTE_WEB/storage" "$REMOTE_WEB/bootstrap/cache" 2>/dev/null || true
cd "$REMOTE_WEB"
composer install --no-dev --optimize-autoloader --no-interaction
if [[ "${RUN_LARAVEL_MIGRATE}" == "1" ]]; then
  echo "[deploy] php artisan migrate --force …"
  php artisan migrate --force
else
  echo "[deploy] RUN_LARAVEL_MIGRATE≠1 — migrate Laravel ignorado"
fi
php artisan config:cache
php artisan route:cache
php artisan view:cache
REMOTE
  ssh "${SSH_OPTS[@]}" "${SSH_USER}@${SSH_HOST}" \
    "sudo chown -R ubuntu:www-data ${REMOTE_WEB}/storage ${REMOTE_WEB}/bootstrap/cache 2>/dev/null || true"
  echo "[deploy] Laravel concluído."
}

case "$TARGET" in
  api) deploy_api ;;
  web) deploy_web ;;
  all) deploy_api; deploy_web ;;
  *) echo "Uso: $0 api|web|all" >&2; exit 1 ;;
esac
