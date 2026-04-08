#!/usr/bin/env node
/**
 * Rebuilds es-ES.json from pt-BR structure: keeps existing ES strings,
 * fills gaps with scripts/i18n-missing-es-overrides.json then en-US.
 * Drops keys not present in pt-BR (orphans).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../src/i18n/locales');
const overridesPath = path.join(__dirname, 'i18n-missing-es-overrides.json');

const pt = JSON.parse(fs.readFileSync(path.join(localesDir, 'pt-BR.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en-US.json'), 'utf8'));
const es = JSON.parse(fs.readFileSync(path.join(localesDir, 'es-ES.json'), 'utf8'));
const overrides = fs.existsSync(overridesPath)
  ? JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
  : {};

function align(esNode, ptNode, enNode, pathPrefix) {
  if (ptNode === null || typeof ptNode !== 'object' || Array.isArray(ptNode)) {
    if (esNode !== undefined && esNode !== null && String(esNode).trim() !== '') {
      return esNode;
    }
    if (overrides[pathPrefix]) return overrides[pathPrefix];
    if (enNode !== undefined && enNode !== null && String(enNode).trim() !== '') {
      return enNode;
    }
    return ptNode;
  }
  const out = {};
  for (const k of Object.keys(ptNode)) {
    const p = pathPrefix ? `${pathPrefix}.${k}` : k;
    out[k] = align(esNode?.[k], ptNode[k], enNode?.[k], p);
  }
  return out;
}

const merged = align(es, pt, en, '');
fs.writeFileSync(
  path.join(localesDir, 'es-ES.json'),
  JSON.stringify(merged, null, 2) + '\n',
  'utf8',
);
console.log('es-ES.json rebuilt from pt-BR structure.');
