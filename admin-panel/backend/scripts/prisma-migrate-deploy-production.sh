#!/usr/bin/env bash
<<<<<<< HEAD
# Produção: migrate deploy + P3009 (--rolled-back) + P3018/42701 (--applied)
set -euo pipefail
[[ "${SKIP_PRISMA_MIGRATE:-0}" == "1" ]] && echo "[prisma] SKIP_PRISMA_MIGRATE=1" && exit 0
cd "$(dirname "$0")/.."
MAX="${PRISMA_MIGRATE_MAX_ROUNDS:-6}"
extract_p3009() { echo "$1" | sed -n 's/.*The `\([^`]*\)` migration started at.*failed.*/\1/p' | head -1; }
extract_name3018() { echo "$1" | sed -n 's/.*Migration name:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1; }
is_dup() { echo "$1" | grep -qE '(P3018|42701|already exists)'; }
round=0
while [[ $round -lt $MAX ]]; do
  round=$((round + 1))
  echo "[prisma] migrate deploy (ciclo $round/$MAX) …"
=======
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

>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
  set +e
  out="$(npx prisma migrate deploy 2>&1)"
  rc=$?
  set -e
  echo "$out"
<<<<<<< HEAD
  [[ $rc -eq 0 ]] && echo "[prisma] OK" && exit 0
  n1="$(extract_p3009 "$out")"
  if [[ -n "$n1" ]]; then npx prisma migrate resolve --rolled-back "$n1"; continue; fi
  if is_dup "$out"; then
    n2="$(extract_name3018 "$out")"
    [[ -n "$n2" ]] && npx prisma migrate resolve --applied "$n2" && continue
  fi
  echo "[prisma] Falha sem recuperação automática." >&2
  exit 1
done
=======

  if [[ $rc -eq 0 ]]; then
    echo "[prisma] migrate deploy concluído."
    exit 0
  fi

  # P3009: migração em estado failed
  n1="$(extract_p3009_name "$out")"
  if [[ -n "$n1" ]]; then
    echo "[prisma] P3009 — resolve --rolled-back \"$n1\" …"
    npx prisma migrate resolve --rolled-back "$n1"
    continue
  fi

  # P3018 / SQL duplicado: esquema já reflete a migração
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
>>>>>>> c29d66d (feat: add Twilio integration for OTP via SMS/WhatsApp in admin panel)
exit 1
