'use strict';

const TASK_ICON_MAX = 80;

const TASK_ICON_LIBRARIES = new Set([
  'Ionicons',
  'AntDesign',
  'Entypo',
  'Feather',
  'FontAwesome',
  'FontAwesome5',
  'Foundation',
  'MaterialIcons',
  'MaterialCommunityIcons',
  'Octicons',
]);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeTaskIconLibrary(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s || s.length > 48) return '';
  return TASK_ICON_LIBRARIES.has(s) ? s : '';
}

/**
 * Nome de ícone Ionicons (kebab-case) para metadata.icon do modelo / tarefa.
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeTaskIconName(raw) {
  if (raw == null) return '';
  const s = String(raw).trim().toLowerCase();
  if (!s || s.length > TASK_ICON_MAX) return '';
  if (!/^[a-z0-9-]+$/.test(s)) return '';
  return s;
}

/**
 * @param {Record<string, unknown>} [meta]
 * @returns {string}
 */
function compactTemplateMetadataForPrompt(meta) {
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const icon = sanitizeTaskIconName(m.icon);
  const iconLibrary = sanitizeTaskIconLibrary(m.iconLibrary);
  try {
    const o = { icon };
    if (icon && iconLibrary && iconLibrary !== 'Ionicons') o.iconLibrary = iconLibrary;
    return JSON.stringify(o);
  } catch {
    return '{"icon":""}';
  }
}

/**
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} patch
 * @returns {{ metadata: Record<string, unknown>, warnings: string[] }}
 */
function applyTemplateMetadataPatch(current, patch) {
  const warnings = [];
  const base =
    current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { metadata: base, warnings };
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'icon')) {
    const rawIc = patch.icon;
    if (rawIc === '' || rawIc === null) {
      delete base.icon;
      delete base.iconLibrary;
    } else {
      const ic = sanitizeTaskIconName(rawIc);
      if (ic) base.icon = ic;
      else warnings.push('templateMetadataPatch.icon ignorado (formato inválido).');
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'iconLibrary')) {
    const rawLib = patch.iconLibrary;
    if (rawLib === '' || rawLib === null) {
      delete base.iconLibrary;
    } else {
      const lib = sanitizeTaskIconLibrary(rawLib);
      if (lib && lib !== 'Ionicons') base.iconLibrary = lib;
      else delete base.iconLibrary;
      if (!lib && String(rawLib || '').trim())
        warnings.push('templateMetadataPatch.iconLibrary ignorado (valor inválido).');
    }
  }
  return { metadata: base, warnings };
}

module.exports = {
  sanitizeTaskIconName,
  sanitizeTaskIconLibrary,
  compactTemplateMetadataForPrompt,
  applyTemplateMetadataPatch,
};
