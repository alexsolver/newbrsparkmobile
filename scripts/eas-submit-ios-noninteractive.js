/**
 * EAS Submit iOS em modo não interativo: o CLI exige `ascAppId` no eas.json
 * (não é expandido a partir de process.env pelo @expo/eas-json).
 * Este script injeta ASC_APP_ID no perfil submit.production.ios, corre o submit
 * e repõe o eas.json original.
 *
 * Variáveis úteis (ver https://docs.expo.dev/submit/ios/):
 * - ASC_APP_ID — Apple ID numérico do app (App Store Connect → App → Informações do app)
 * - EXPO_TOKEN — autenticação Expo em CI
 * - EXPO_APPLE_ID + EXPO_APPLE_APP_SPECIFIC_PASSWORD — ou chave API ASC no eas.json / credenciais EAS
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const easPath = path.join(root, 'eas.json');

const ascAppId = (process.env.ASC_APP_ID || '').trim();
if (!ascAppId || !/^\d+$/.test(ascAppId)) {
  console.error(
    'Defina ASC_APP_ID com o Apple ID numérico do app (só dígitos). App Store Connect → Apps → [app] → Informações do app → Apple ID.'
  );
  process.exit(1);
}

const original = fs.readFileSync(easPath, 'utf8');
let restored = false;
function restore() {
  if (!restored) {
    fs.writeFileSync(easPath, original, 'utf8');
    restored = true;
  }
}

function onSignal() {
  restore();
  process.exit(130);
}
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

try {
  const json = JSON.parse(original);
  json.submit = json.submit || {};
  json.submit.production = json.submit.production || {};
  json.submit.production.ios = {
    bundleIdentifier: 'com.lansolver.ariamobile',
    ...(json.submit.production.ios || {}),
    ascAppId,
  };
  const team = (process.env.APPLE_TEAM_ID || '').trim();
  if (team) {
    json.submit.production.ios.appleTeamId = team;
  }
  fs.writeFileSync(easPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  const passthrough = process.argv.slice(2);
  const args = [
    'eas',
    'submit',
    '--platform',
    'ios',
    '--profile',
    'production',
    '--latest',
    '--non-interactive',
    '--wait',
    ...passthrough,
  ];
  const r = spawnSync('npx', args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(r.status === null ? 1 : r.status);
} finally {
  restore();
}
