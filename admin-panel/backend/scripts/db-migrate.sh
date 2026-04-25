#!/bin/bash
# db-migrate.sh — Migração SEGURA do banco (nunca faz reset)
# Substitui o perigoso `prisma migrate dev` por uma sequência segura:
# 1. Backup automático antes de migrar
# 2. Usa --create-only se necessário
# 3. Aplica apenas com `prisma migrate deploy` (sem perguntas de reset)

set -e

SCRIPT_DIR="$(dirname "$0")"
echo "🔒 Migrando banco com segurança..."

# 1. Backup obrigatório antes de migrar
bash "$SCRIPT_DIR/backup.sh" "pre-migrate"

# 2. Aplica migrações PENDENTES sem perguntar nada (nunca reseta)
#    `migrate deploy` é o modo seguro de produção — nunca faz reset.
echo ""
echo "🔄 Aplicando migrações pendentes..."
# Usar o Prisma do próprio projeto (node_modules) para não apanhar o Prisma 7+ do cache global do npx.
PRISMA_BIN="$(dirname "$0")/../node_modules/.bin/prisma"
if [ -x "$PRISMA_BIN" ]; then
  "$PRISMA_BIN" migrate deploy
else
  # Fallback: fixa major 5 (package.json) — evita P1012 do CLI 7 quando url está no schema.
  npx --yes prisma@5.10.0 migrate deploy
fi

echo ""
echo "✅ Migração concluída com segurança."
