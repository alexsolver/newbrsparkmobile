'use strict';

const { mergeTheme } = require('./reportThemeDefaults');

/** Chaves de módulos alinhadas ao PDF da Central de Operações */
const MODULE_KEYS = [
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

function normalizeModuleOrder(arr) {
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

function defaultPresetConfig() {
  return {
    modules: defaultModules(),
    moduleOrder: [...MODULE_KEYS],
    theme: mergeTheme(null),
    logoUrl: null,
    reportTitle: null,
    reportSubtitle: null,
    hideEmptyFields: false,
    fields: {},
  };
}

/**
 * @param {object|null|undefined} raw
 * @returns {object} config normalizado
 */
function mergePresetConfig(raw) {
  const base = defaultPresetConfig();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const out = {
    ...base,
    ...raw,
    modules: { ...defaultModules() },
    theme: mergeTheme(raw.theme),
    moduleOrder: normalizeModuleOrder(raw.moduleOrder),
  };
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
  out.logoUrl = raw.logoUrl != null && String(raw.logoUrl).trim() !== '' ? String(raw.logoUrl) : null;
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
 * @param {object} config
 * @param {string} fieldId
 * @param {string} [fieldType] — campos financeiros do técnico ficam ocultos no PDF por padrão (só com visibilidade explícita no preset).
 */
function isFieldVisible(config, fieldId, fieldType) {
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

function fieldLabelOverride(config, fieldId) {
  const f = config.fields && config.fields[fieldId];
  if (!f || typeof f !== 'object') return null;
  const lab = f.label != null ? String(f.label).trim() : '';
  return lab || null;
}

module.exports = {
  MODULE_KEYS,
  defaultPresetConfig,
  mergePresetConfig,
  normalizeModuleOrder,
  isFieldVisible,
  fieldLabelOverride,
};
