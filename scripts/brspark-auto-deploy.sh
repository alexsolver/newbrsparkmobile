#!/usr/bin/env bash
#
# Servidor de produção: git pull → rsync → npm, Prisma (API), build Vite + Laravel (web).
# Espera clones em:
#   /var/www/deploy/newbrsparkmobile  (branch: BRSPARK_MOBILE_BRANCH, default sparkmobile)
#   /var/www/deploy/BRSpark           (branch: BRSPARK_WEB_BRANCH, default main; repo privado = deploy key SSH)
#
# BRSPARK_FORCE_DEPLOY=1 — corre npm/prisma/Laravel mesmo sem novo commit (emergência).
# Estado em /var/www/deploy/.state/{api-head,web-head} para não repetir npm ci a cada minuto.
#
set -uo pipefail

LOG=/var/www/deploy/logs/brspark-auto-deploy.log
mkdir -p /var/www/deploy/.state /var/www/deploy/logs /run/lock 2>/dev/null || true
exec >>"$LOG" 2>&1

echo ""
echo "=== $(date -Is) brspark-auto-deploy ==="

exec 9>/run/lock/brspark-auto-deploy.lock
if ! flock -n 9; then
  echo "[deploy] outra instância em execução, a saltar."
  exit 0
fi

export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"

REMOTE_API=/var/www/brspark-api
REMOTE_WEB=/var/www/brspark-web
DEPLOY_ROOT=/var/www/deploy
STATE_DIR=$DEPLOY_ROOT/.state

MOBILE_REPO=$DEPLOY_ROOT/newbrsparkmobile
WEB_REPO=$DEPLOY_ROOT/BRSpark
MOBILE_BRANCH="${BRSPARK_MOBILE_BRANCH:-sparkmobile}"
WEB_BRANCH="${BRSPARK_WEB_BRANCH:-main}"
FORCE="${BRSPARK_FORCE_DEPLOY:-0}"

STATUS=0

should_run() {
  local state_file="$1" new_hash="$2"
  if [[ "$FORCE" == "1" ]]; then
    return 0
  fi
  local old_hash=""
  [[ -f "$state_file" ]] && old_hash="$(cat "$state_file")" || true
  [[ "$old_hash" != "$new_hash" ]]
}

write_state() {
  local state_file="$1" new_hash="$2"
  mkdir -p "$STATE_DIR"
  echo "$new_hash" >"$state_file"
}

deploy_api() {
  set -e
  cd "$MOBILE_REPO"
  git fetch origin "$MOBILE_BRANCH"
  git checkout "$MOBILE_BRANCH"
  git pull --ff-only origin "$MOBILE_BRANCH"
  local mh
  mh="$(git rev-parse HEAD)"
  local state_file="$STATE_DIR/api-head"
  if ! should_run "$state_file" "$mh"; then
    echo "[api] sem alterações ($mh), a saltar."
    return 0
  fi
  echo "[api] commit $mh — rsync + npm + prisma…"
  rsync -a --delete \
    --exclude '.env' --exclude '.env.*' --exclude 'node_modules' --exclude '.git' \
    --exclude '.DS_Store' --exclude '*.log' --exclude 'backups/**' \
    --exclude 'backend/public/uploads/**' \
    "$MOBILE_REPO/admin-panel/" "$REMOTE_API/"

  cd "$REMOTE_API/backend"
  export NODE_ENV=production
  npm ci --omit=dev
  bash scripts/prisma-migrate-deploy-production.sh
  npx prisma generate
  pm2 restart brspark-api
  write_state "$state_file" "$mh"
  echo "[api] concluído."
}

deploy_web() {
  set -e
  cd "$WEB_REPO"
  git fetch origin "$WEB_BRANCH"
  git checkout "$WEB_BRANCH"
  git pull --ff-only origin "$WEB_BRANCH"
  local wh
  wh="$(git rev-parse HEAD)"
  local state_file="$STATE_DIR/web-head"
  if ! should_run "$state_file" "$wh"; then
    echo "[web] sem alterações ($wh), a saltar."
    return 0
  fi
  echo "[web] commit $wh — frontend + Laravel…"
  local fr be
  fr="$WEB_REPO/frontend"
  be="$WEB_REPO/backend"
  if [[ -d "$fr" && -f "$fr/package.json" ]]; then
    (cd "$fr" && npm ci && npm run build)
    mkdir -p "$be/public/assets" "$be/public/locales"
    rsync -a --delete "$fr/dist/assets/" "$be/public/assets/"
    if [[ -d "$fr/dist/locales" ]]; then
      rsync -a --delete "$fr/dist/locales/" "$be/public/locales/"
    fi
    rsync -a "$fr/dist/" "$be/public/" --exclude assets --exclude locales --exclude '.DS_Store' || true
  else
    echo "[web] aviso: frontend em falta — só backend."
  fi

  rsync -rlvz --delete --omit-dir-times \
    --exclude '.env' --exclude '.env.*' --exclude 'vendor' --exclude 'node_modules' \
    --exclude '.git' --exclude '.DS_Store' \
    --exclude 'storage/logs/**' \
    --exclude 'storage/framework/cache/**' \
    --exclude 'storage/framework/sessions/**' \
    --exclude 'storage/framework/views/**' \
    --exclude 'bootstrap/cache/*.php' \
    "$be/" "$REMOTE_WEB/"

  sudo chown -R ubuntu:www-data "$REMOTE_WEB/storage" "$REMOTE_WEB/bootstrap/cache" "$REMOTE_WEB/storage/logs" 2>/dev/null || true
  chmod -R ug+rwX "$REMOTE_WEB/storage" "$REMOTE_WEB/bootstrap/cache" 2>/dev/null || true

  cd "$REMOTE_WEB"
  composer install --no-dev --optimize-autoloader --no-interaction
  php artisan migrate --force
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache
  sudo chown -R ubuntu:www-data "$REMOTE_WEB/storage" "$REMOTE_WEB/bootstrap/cache" 2>/dev/null || true
  write_state "$state_file" "$wh"
  echo "[web] concluído."
}

if [[ ! -d "$MOBILE_REPO/.git" ]]; then
  echo "[api] ERRO: clone em falta em $MOBILE_REPO"
  STATUS=1
else
  deploy_api || { echo "[api] ERRO no deploy." >&2; STATUS=1; }
fi

if [[ ! -d "$WEB_REPO/.git" ]]; then
  echo "[web] Aviso: clone BRSpark em falta em $WEB_REPO (adicione deploy key SSH e: git clone git@github.com-brspark:alexsolver/BRSpark.git $WEB_REPO)"
else
  deploy_web || { echo "[web] ERRO no deploy." >&2; STATUS=1; }
fi

echo "=== $(date -Is) fim (exit $STATUS) ==="
exit "$STATUS"
