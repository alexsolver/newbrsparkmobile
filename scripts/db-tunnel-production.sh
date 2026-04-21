#!/usr/bin/env bash
#
# Túnel SSH até ao PostgreSQL de produção (no servidor o Postgres só escuta em 127.0.0.1).
# Conta no servidor: utilizador "dbtunnel" (chave restringida a encaminhar só para 127.0.0.1:5432).
#
# Uso:
#   ./scripts/db-tunnel-production.sh
#   LOCAL_PG_PORT=15432 ./scripts/db-tunnel-production.sh
#
# Noutro terminal ou num cliente gráfico, ligue a:
#   Host: 127.0.0.1 (use IPv4 explícito; evita ::1 com clientes que duplicam o bind)
#   Porta: ${LOCAL_PG_PORT:-15432}
#   User/senha/base: os mesmos de produção (no servidor: .env Laravel / API).
#
# Em produção o Postgres tem ssl=on com certificado local; pelo túnel muitos clientes
# falham se tentarem "verify-full". Use:
#   URL psql:  postgresql://USER:SENHA@127.0.0.1:PORTA/NOME_DB?sslmode=disable
#   JDBC:      jdbc:postgresql://127.0.0.1:PORTA/NOME_DB?sslmode=disable
#   DBeaver:   SSL → "Desligado" ou sslmode disable na URL; não use o IP público da AWS
#             no separador Postgres — só 127.0.0.1 com o túnel aberto.
#
# Chave SSH: esta conta usa a tua chave pública (não a .pem do deploy). Por omissão
#   ~/.ssh/id_ed25519 — ajusta com BRSPARK_DB_TUNNEL_KEY se necessário.
#
set -euo pipefail

SSH_HOST="${BRSPARK_SSH_HOST:-3.149.14.138}"
SSH_USER="${BRSPARK_DB_TUNNEL_USER:-dbtunnel}"
SSH_KEY="${BRSPARK_DB_TUNNEL_KEY:-$HOME/.ssh/id_ed25519}"
LOCAL_PORT="${LOCAL_PG_PORT:-15432}"
REMOTE_PG="${BRSPARK_REMOTE_PG_HOST:-127.0.0.1}"
REMOTE_PORT="${BRSPARK_REMOTE_PG_PORT:-5432}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "[db-tunnel] Chave não encontrada: $SSH_KEY" >&2
  echo "         Coloque a chave privada correspondente à pública em authorized_keys do ${SSH_USER} no servidor," >&2
  echo "         ou defina BRSPARK_DB_TUNNEL_KEY=/caminho/para/id_ed25519" >&2
  exit 1
fi

echo "[db-tunnel] ${SSH_USER}@${SSH_HOST} → 127.0.0.1 (esta máquina) :${LOCAL_PORT} → ${REMOTE_PG}:${REMOTE_PORT} (no servidor)"
echo "[db-tunnel] A usar chave: ${SSH_KEY}"
echo "[db-tunnel] Ctrl+C para terminar."
exec ssh -N \
  -o ExitOnForwardFailure=yes \
  -o IdentitiesOnly=yes \
  -o ServerAliveInterval=60 \
  -o ServerAliveCountMax=3 \
  -i "$SSH_KEY" \
  -L "${LOCAL_PORT}:${REMOTE_PG}:${REMOTE_PORT}" \
  "${SSH_USER}@${SSH_HOST}"
