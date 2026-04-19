/**
 * Preset de relatório PDF — espelha admin-panel/backend/src/lib/reportPresetDefaults.js
 */

import { mergeTheme } from './reportThemeBrowser.js';

export const MODULE_KEYS = [
  'topbar',
  'headerBanner',
  'technicalBlock',
  'productivity',
  'timeline',
  'transit',
  'formResponses',
  'photoGallery',
  'footer',
];

function defaultModules() {
  const o = Object.create(null);
  for (const k of MODULE_KEYS) o[k] = true;
  return o;
}

export function normalizeModuleOrder(arr) {
  const seen = new Set();
  const out = [];
  if (Array.isArray(arr)) {
    for (const k of arr) {
      if (typeof k === 'string' && MODULE_KEYS.includes(k) && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  for (const k of MODULE_KEYS) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

export function mergePresetConfig(raw) {
  const base = {
    modules: defaultModules(),
    moduleOrder: [...MODULE_KEYS],
    theme: mergeTheme(null),
    logoUrl: null,
    reportTitle: null,
    reportSubtitle: null,
    hideEmptyFields: false,
    fields: {},
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const out = { ...base, ...raw, modules: { ...defaultModules() }, theme: mergeTheme(raw.theme) };
  out.moduleOrder = normalizeModuleOrder(raw.moduleOrder);
  if (raw.modules && typeof raw.modules === 'object' && !Array.isArray(raw.modules)) {
    for (const k of MODULE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(raw.modules, k)) {
        out.modules[k] = !!raw.modules[k];
      }
    }
  }
  out.fields =
    raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields) ? { ...raw.fields } : {};
  out.hideEmptyFields = !!raw.hideEmptyFields;
  out.logoUrl = raw.logoUrl != null && String(raw.logoUrl).trim() !== '' ? String(raw.logoUrl).trim() : null;
  out.reportTitle =
    raw.reportTitle != null && String(raw.reportTitle).trim() !== ''
      ? String(raw.reportTitle)
      : null;
  out.reportSubtitle =
    raw.reportSubtitle != null && String(raw.reportSubtitle).trim() !== ''
      ? String(raw.reportSubtitle)
      : null;
  return out;
}

/**
 * @param {string} [fieldType] — custos do técnico: omitidos do PDF por padrão.
 */
export function isFieldVisible(config, fieldId, fieldType) {
  if (!fieldId) return true;
  if (
    fieldType === 'technician_finance' ||
    fieldType === 'technician_finance_expense' ||
    fieldType === 'technician_finance_revenue'
  ) {
    const f = config.fields && config.fields[fieldId];
    if (!f || typeof f !== 'object') return false;
    return !!f.visible;
  }
  const f = config.fields && config.fields[fieldId];
  if (!f || typeof f !== 'object') return true;
  if (Object.prototype.hasOwnProperty.call(f, 'visible')) return !!f.visible;
  return true;
}

export function fieldLabelOverride(config, fieldId) {
  const f = config.fields && config.fields[fieldId];
  if (!f || typeof f !== 'object') return null;
  const lab = f.label != null ? String(f.label).trim() : '';
  return lab || null;
}

export function safeLogoSrcForAttr(url) {
  const s = url && String(url).trim();
  if (!s) return 'img/logo.png';
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return s.replace(/"/g, '%22');
  return 'img/logo.png';
}
