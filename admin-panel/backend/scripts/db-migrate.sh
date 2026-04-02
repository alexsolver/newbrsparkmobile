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
npx prisma migrate deploy

echo ""
echo "✅ Migração concluída com segurança."
