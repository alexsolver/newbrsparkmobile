#!/usr/bin/env bash
#
# Desenvolvimento: sobe o túnel SSH para o Postgres de produção (se o .env apontar para 127.0.0.1/localhost),
# depois corre o nodemon. Ao sair (Ctrl+C ou erro), termina o processo ssh do túnel.
#
# Sobrescrever comportamento:
#   ARIA_SKIP_DEV_TUNNEL=1     — não abre túnel (ex.: Postgres já local ou túnel manual noutro terminal)
#   ARIA_SSH_KEY, ARIA_SSH_HOST, ARIA_SSH_USER — igual a scripts/prod-postgres-tunnel.sh (ubuntu + .pem)
#   ARIA_USE_DB_TUNNEL_USER=1  — usa utilizador dbtunnel + ARIA_DB_TUNNEL_KEY (~/.ssh/id_ed25519)
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$PATH"

if [[ "${ARIA_SKIP_DEV_TUNNEL:-}" == "1" ]]; then
  # Sem `exec` no primeiro comando — senão o processo termina após o check e o nodemon nunca corre.
  node scripts/checkLocalDbReachable.js && exec nodemon src/index.js
fi

IFS='|' read -r MODE DB_HOST LOCAL_PORT < <(node << 'NODE'
'use strict';
require('dotenv').config();
const u = process.env.DATABASE_URL;
if (!u) {
  console.error('DATABASE_URL em falta no .env');
  process.exit(1);
}
try {
  const url = new URL(String(u).replace(/^postgresql:\/\//i, 'http://'));
  const h = (url.hostname || '').toLowerCase();
  const p = url.port || '5432';
  const loop = h === '127.0.0.1' || h === 'localhost' || h === '::1';
  console.log((loop ? 'loop' : 'remote') + '|' + h + '|' + p);
} catch (e) {
  console.error('DATABASE_URL inválido:', e.message);
  process.exit(1);
}
NODE
) || exit 1

SSH_PID=""
cleanup() {
  if [[ -n "$SSH_PID" ]] && kill -0 "$SSH_PID" 2>/dev/null; then
    kill "$SSH_PID" 2>/dev/null || true
    wait "$SSH_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM HUP

if [[ "$MODE" != "loop" ]]; then
  echo "[dev] DATABASE_URL → ${DB_HOST}:${LOCAL_PORT} (não é loopback). Túnel SSH omitido."
  exec node scripts/checkLocalDbReachable.js && exec nodemon src/index.js
fi

if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
  echo "[dev] Porta local ${LOCAL_PORT} já está aberta — reutilizando (túnel existente)."
else
  SSH_HOST="${ARIA_SSH_HOST:-3.149.14.138}"

  if [[ "${ARIA_USE_DB_TUNNEL_USER:-}" == "1" ]]; then
    SSH_USER="${ARIA_DB_TUNNEL_USER:-dbtunnel}"
    SSH_KEY="${ARIA_DB_TUNNEL_KEY:-$HOME/.ssh/id_ed25519}"
    SSH_EXTRA=( -o IdentitiesOnly=yes -i "$SSH_KEY" )
  else
    SSH_USER="${ARIA_SSH_USER:-ubuntu}"
    SSH_KEY="${ARIA_SSH_KEY:-$HOME/Downloads/alex.pem}"
    SSH_EXTRA=( -i "$SSH_KEY" )
  fi

  if [[ ! -f "$SSH_KEY" ]]; then
    echo "[dev] Chave SSH não encontrada: $SSH_KEY" >&2
    echo "      Defina ARIA_SSH_KEY (ubuntu) ou ARIA_DB_TUNNEL_KEY / ARIA_USE_DB_TUNNEL_USER=1" >&2
    exit 1
  fi

  echo "[dev] A abrir túnel SSH ${SSH_USER}@${SSH_HOST} → 127.0.0.1:${LOCAL_PORT} (Postgres remoto 127.0.0.1:5432)…"
  ssh -N \
    -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    -o StrictHostKeyChecking=accept-new \
    "${SSH_EXTRA[@]}" \
    -L "${LOCAL_PORT}:127.0.0.1:5432" \
    "${SSH_USER}@${SSH_HOST}" &
  SSH_PID=$!

  READY=0
  for _ in $(seq 1 75); do
    if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
      READY=1
      break
    fi
    if ! kill -0 "$SSH_PID" 2>/dev/null; then
      echo "[dev] Processo ssh terminou antes do túnel ficar disponível." >&2
      exit 1
    fi
    sleep 0.2
  done

  if [[ "$READY" != "1" ]]; then
    echo "[dev] Timeout à espera da porta ${LOCAL_PORT}." >&2
    exit 1
  fi
  echo "[dev] Túnel ativo (pid $SSH_PID). A iniciar API…"
fi

node scripts/checkLocalDbReachable.js
# Não usar exec: ao sair do nodemon o trap fecha o ssh do túnel.
nodemon src/index.js
