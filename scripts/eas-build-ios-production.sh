#!/usr/bin/env bash
# iOS release → API https://api.brspark.com (eas.json perfil production).
# O primeiro build pode pedir Apple Developer: certificado / perfis (BrsparkMobile + LiveActivity).
# Executar no Terminal (modo interativo): não use --non-interactive na primeira vez.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npx eas build --profile production --platform ios "$@"
