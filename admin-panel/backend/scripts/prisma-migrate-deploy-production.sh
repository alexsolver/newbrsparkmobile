#!/usr/bin/env bash
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
  set +e
  out="$(npx prisma migrate deploy 2>&1)"
  rc=$?
  set -e
  echo "$out"
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
exit 1
