/**
 * Mescla appAlerts em cada src/i18n/locales/*.json a partir de i18n-app-alerts-bundle.json
 * Uso: node scripts/merge-app-alerts.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const bundlePath = path.join(__dirname, 'i18n-app-alerts-bundle.json');
const localesDir = path.join(root, 'src', 'i18n', 'locales');

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

for (const lang of ['pt-BR', 'en-US', 'es-ES', 'de-DE']) {
  const file = path.join(localesDir, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!bundle[lang]) throw new Error(`Missing bundle.${lang}`);
  data.appAlerts = bundle[lang];
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
console.log('appAlerts merged into 4 locale files.');
