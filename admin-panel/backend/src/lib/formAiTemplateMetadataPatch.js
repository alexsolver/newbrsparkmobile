'use strict';

const TASK_ICON_MAX = 80;

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
  try {
    return JSON.stringify({ icon });
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
    } else {
      const ic = sanitizeTaskIconName(rawIc);
      if (ic) base.icon = ic;
      else warnings.push('templateMetadataPatch.icon ignorado (formato inválido).');
    }
  }
  return { metadata: base, warnings };
}

module.exports = {
  sanitizeTaskIconName,
  compactTemplateMetadataForPrompt,
  applyTemplateMetadataPatch,
};
