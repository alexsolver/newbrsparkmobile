#!/usr/bin/env bash
# Falha se o painel admin reintroduzir handlers DOM inline (CSP / consistência com addEventListener).
# Exclui admin-panel/vendor (terceiros).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

html_rx='<[a-zA-Z][a-zA-Z0-9:-]*[^>]*(onclick|onchange|oninput|onblur|onkeyup|onsubmit|onfocus|onmouseover|onmouseout)[[:space:]]*='
prop_rx='\.(onclick|onchange|oninput|onblur|onkeyup|onsubmit)[[:space:]]*='

fail=0
while IFS= read -r -d '' f; do
  if grep -nE "$html_rx" "$f" 2>/dev/null; then
    echo "check-no-inline-dom-handlers: markup inline em $f" >&2
    fail=1
  fi
done < <(find admin-panel -path 'admin-panel/vendor/*' -prune -o -name '*.html' -type f -print0)

check_js_tree() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  while IFS= read -r -d '' f; do
    if grep -nE "$html_rx" "$f" 2>/dev/null; then
      echo "check-no-inline-dom-handlers: markup inline em string/HTML em $f" >&2
      fail=1
    fi
    if grep -nE "$prop_rx" "$f" 2>/dev/null; then
      echo "check-no-inline-dom-handlers: atribuição .on* em $f" >&2
      fail=1
    fi
  done < <(find "$dir" \( -path '*/node_modules/*' -o -path '*/coverage/*' \) -prune -o -type f -name '*.js' -print0)
}

check_js_tree admin-panel/js
check_js_tree admin-panel/backend

if [[ "$fail" -ne 0 ]]; then
  echo "check-no-inline-dom-handlers: corrija os ficheiros acima (use addEventListener / delegação)." >&2
  exit 1
fi

echo "check-no-inline-dom-handlers: OK (HTML, admin-panel/js, admin-panel/backend)."
