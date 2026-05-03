#!/usr/bin/env bash
# Lista ficheiros em app/ e src/components com possível texto de UI em português
# (acentos comuns). Usa ripgrep (rg) se existir; senão grep -R (mais lento).
# Uso: npm run i18n:scan-pt   ou   bash scripts/i18n-scan-pt-ui.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PT='[ãõáéíóúâêôçÃÕÁÉÍÓÚÂÊÔÇ]'

scan_dir() {
  local dir="$1"
  if command -v rg >/dev/null 2>&1; then
    rg -l "$PT" "$dir" --glob '*.tsx' --glob '*.ts' 2>/dev/null | sort || true
  else
    # fallback: nomes de ficheiro que contêm o padrão (grep não suporta bem só .tsx em BSD)
    find "$dir" \( -name '*.tsx' -o -name '*.ts' \) ! -path '*/node_modules/*' -print0 2>/dev/null |
      xargs -0 grep -l "$PT" 2>/dev/null | sort || true
  fi
}

echo "=== TS/TSX com caracteres acentuados (PT comum) em app/ ==="
scan_dir app

echo ""
echo "=== TS/TSX com caracteres acentuados em src/components/ ==="
scan_dir src/components

echo ""
echo "=== Amostra de linhas (app/, max 60) ==="
if command -v rg >/dev/null 2>&1; then
  rg "$PT" app --glob '*.tsx' -n 2>/dev/null | head -n 60 || true
else
  find app \( -name '*.tsx' \) ! -path '*/node_modules/*' -print0 2>/dev/null | xargs -0 grep -n "$PT" 2>/dev/null | head -n 60 || true
fi

echo ""
echo "=== Amostra de linhas (src/components/, max 60) ==="
if command -v rg >/dev/null 2>&1; then
  rg "$PT" src/components --glob '*.tsx' -n 2>/dev/null | head -n 60 || true
else
  find src/components \( -name '*.tsx' \) ! -path '*/node_modules/*' -print0 2>/dev/null | xargs -0 grep -n "$PT" 2>/dev/null | head -n 60 || true
fi

echo ""
echo "Próximo passo: substituir por t('…') / i18next.t e chaves em src/i18n/locales/*.json"
