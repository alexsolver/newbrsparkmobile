#!/bin/bash
# backup.sh — Backup automático do banco PostgreSQL BrSpark
# Uso: ./scripts/backup.sh [motivo]
# Salva em: ./backups/brspark_YYYY-MM-DD_HH-MM-SS.sql.gz

set -e

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
REASON="${1:-manual}"
FILENAME="${BACKUP_DIR}/brspark_${TIMESTAMP}_${REASON}.sql.gz"

# Lê DATABASE_URL do .env
RAW_URL=$(grep DATABASE_URL "$(dirname "$0")/../.env" 2>/dev/null | cut -d= -f2- | tr -d '"')
RAW_URL="${RAW_URL:-postgresql://alex@localhost:5432/brspark_admin}"
# Remove parâmetros de query (ex: ?schema=public é do Prisma, não do pg_dump)
DB_URL="${RAW_URL%%\?*}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "⚠️  pg_dump não está no PATH — backup ignorado."
  echo "   Instale o cliente PostgreSQL (ex.: brew install libpq && brew link --force libpq) ou use o pacote postgresql-client."
  echo "   A migração pode continuar com SKIP_BACKUP=1 ou após instalar pg_dump."
  exit 0
fi

set -o pipefail
echo "📦 Backup: $FILENAME"
pg_dump "$DB_URL" | gzip > "$FILENAME"

# Conta quantos usuários existem no backup (sanity check)
USERS=$(pg_dump "$DB_URL" --table='"User"' --data-only 2>/dev/null | grep -c "INSERT INTO" || echo "?")
echo "✅ Backup concluído | ~${USERS} usuários | $(du -h "$FILENAME" | cut -f1)"

# Mantém apenas os últimos 30 backups
ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true

echo "📁 Todos os backups: ls $BACKUP_DIR"
