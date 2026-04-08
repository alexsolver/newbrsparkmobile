#!/usr/bin/env node
/**
 * Ensures pt-BR, en-US, and es-ES locale JSONs have identical flat key sets.
 * Exit 1 on mismatch.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/i18n/locales');
const LANGS = ['pt-BR', 'en-US', 'es-ES'];
const MASTER = 'pt-BR';

function flatKeys(obj, prefix = '') {
  const keys = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return keys;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flatKeys(v, p));
    } else {
      keys.push(p);
    }
  }
  return keys;
}

function loadFlat(lang) {
  const file = path.join(localesDir, `${lang}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  return new Set(flatKeys(data).sort());
}

const masterSet = loadFlat(MASTER);
let failed = false;

for (const lang of LANGS) {
  if (lang === MASTER) continue;
  const set = loadFlat(lang);
  const missing = [...masterSet].filter((k) => !set.has(k));
  const extra = [...set].filter((k) => !masterSet.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`[i18n] ${lang} vs ${MASTER}:`);
    if (missing.length) {
      console.error(`  missing (${missing.length}):`, missing.slice(0, 30).join(', ') + (missing.length > 30 ? '…' : ''));
    }
    if (extra.length) {
      console.error(`  extra (${extra.length}):`, extra.join(', '));
    }
  }
}

if (failed) {
  console.error('\n[i18n] Fix: align keys across src/i18n/locales/*.json (run node scripts/i18n-sync-es.mjs for Spanish).');
  process.exit(1);
}

console.log(`[i18n] OK — ${LANGS.join(', ')} share ${masterSet.size} keys (master: ${MASTER}).`);
