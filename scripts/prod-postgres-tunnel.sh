#!/usr/bin/env bash
# Servidor: ubuntu@3.149.14.138 — PostgreSQL de produção só em 127.0.0.1:5432 no host; não abrimos 5432 na internet.
# Encaminha para o teu Mac: 127.0.0.1:PORTA_LOCAL → 127.0.0.1:5432 no servidor (via SSH).
# Uso: noutro terminal, com ARIA_SSH_KEY apontando para a chave .pem
#
#   export ARIA_SSH_KEY="$HOME/Downloads/alex.pem"
#   ./scripts/prod-postgres-tunnel.sh
#
# Ou, no AriaWeb (túnel + Laravel + fila + logs + Vite na mesma sessão):
#   export ARIA_SSH_KEY="$HOME/Downloads/alex.pem"
#   cd AriaWeb/backend && composer run dev:with-prod-db
#
# Depois no .env do admin-panel/backend (Prisma):
#   DATABASE_URL="postgresql://USER:PASS@127.0.0.1:5433/aria_admin?schema=public"
# e no AriaWeb backend (Laravel): DB_HOST=127.0.0.1 DB_PORT=5433
#
# Parar: Ctrl+C neste terminal.
set -euo pipefail

HOST="${ARIA_SSH_HOST:-3.149.14.138}"
USER="${ARIA_SSH_USER:-ubuntu}"
KEY="${ARIA_SSH_KEY:-}"
LOCAL="${ARIA_TUNNEL_LOCAL_PORT:-5433}"

if [[ -z "$KEY" ]]; then
  echo "[prod-postgres-tunnel] Defina ARIA_SSH_KEY com o caminho absoluto para a chave SSH (ex.: export ARIA_SSH_KEY=\"\$HOME/Downloads/alex.pem\")" >&2
  exit 1
fi
if [[ ! -f "$KEY" ]]; then
  echo "[prod-postgres-tunnel] Ficheiro não encontrado: $KEY" >&2
  exit 1
fi

echo "[prod-postgres-tunnel] A ouvir 127.0.0.1:${LOCAL} → ${USER}@${HOST}:5432 (Postgres remoto via SSH). Ctrl+C para terminar." >&2
exec ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=60 \
  -o ServerAliveCountMax=3 \
  -L "${LOCAL}:127.0.0.1:5432" \
  -i "$KEY" \
  "${USER}@${HOST}"
