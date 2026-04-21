#!/usr/bin/env bash
#
# Produção: aplica `prisma migrate deploy` com recuperação automática:
# - P3009: migrate resolve --rolled-back + novo deploy
# - P3018 / coluna ou objeto já existente: migrate resolve --applied + novo deploy
#
# SKIP_PRISMA_MIGRATE=1 — não faz nada (exit 0).
# PRISMA_MIGRATE_MAX_ROUNDS — máx. ciclos completos (default 6).
#
set -euo pipefail

if [[ "${SKIP_PRISMA_MIGRATE:-0}" == "1" ]]; then
  echo "[prisma] SKIP_PRISMA_MIGRATE=1 — migrates ignorados"
  exit 0
fi

cd "$(dirname "$0")/.."

MAX_ROUNDS="${PRISMA_MIGRATE_MAX_ROUNDS:-6}"
round=0

extract_p3009_name() {
  echo "$1" | sed -n 's/.*The `\([^`]*\)` migration started at.*failed.*/\1/p' | head -1
}

extract_p3018_migration_name() {
  echo "$1" | sed -n 's/.*Migration name:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1
}

is_already_exists_error() {
  echo "$1" | grep -qE '(P3018|42701|already exists)' && return 0
  return 1
}

while [[ $round -lt $MAX_ROUNDS ]]; do
  round=$((round + 1))
  echo "[prisma] migrate deploy (ciclo $round/$MAX_ROUNDS) …"

  set +e
  out="$(npx prisma migrate deploy 2>&1)"
  rc=$?
  set -e
  echo "$out"

  if [[ $rc -eq 0 ]]; then
    echo "[prisma] migrate deploy concluído."
    exit 0
  fi

  n1="$(extract_p3009_name "$out")"
  if [[ -n "$n1" ]]; then
    echo "[prisma] P3009 — resolve --rolled-back \"$n1\" …"
    npx prisma migrate resolve --rolled-back "$n1"
    continue
  fi

  if is_already_exists_error "$out"; then
    n2="$(extract_p3018_migration_name "$out")"
    if [[ -n "$n2" ]]; then
      echo "[prisma] Objeto já existente (P3018/42701) — resolve --applied \"$n2\" …"
      npx prisma migrate resolve --applied "$n2"
      continue
    fi
  fi

  echo "[prisma] migrate deploy falhou sem recuperação automática. Ver saída acima." >&2
  exit 1
done

echo "[prisma] migrate deploy: limite de ciclos ($MAX_ROUNDS) atingido." >&2
exit 1
