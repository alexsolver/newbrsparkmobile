'use strict';

const ALLOWED_KEYS = new Set([
  'requireGlobalGeofence',
  'globalGeofenceRadius',
  'appFillMode',
  'appSectionStart',
  'appHubSectionOrder',
  'expectedFormDurationMinutes',
]);

/**
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} patch
 * @returns {{ settings: Record<string, unknown>, warnings: string[] }}
 */
function applyTemplateSettingsPatch(current, patch) {
  const warnings = [];
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? /** @type {Record<string, unknown>} */ ({ ...current })
      : {};
  if (!base.rules) base.rules = [];

  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { settings: base, warnings };
  }

  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(k)) {
      warnings.push(`Definição ignorada (não permitida ao copiloto): ${k}`);
      continue;
    }
    if (k === 'requireGlobalGeofence') {
      base[k] = v === true || v === 'true';
    } else if (k === 'globalGeofenceRadius') {
      const n = Number(v);
      if (Number.isFinite(n)) {
        base[k] = Math.min(10_000, Math.max(10, Math.round(n)));
      }
    } else if (k === 'appFillMode') {
      const s = String(v || '').trim().toLowerCase();
      if (s === 'wizard' || s === 'hybrid' || s === 'full') base[k] = s;
    } else if (k === 'appSectionStart') {
      base[k] = String(v || '').trim().toLowerCase() === 'hub' ? 'hub' : 'direct';
    } else if (k === 'appHubSectionOrder') {
      base[k] = String(v || '').trim().toLowerCase() === 'sequential' ? 'sequential' : 'free';
    } else if (k === 'expectedFormDurationMinutes') {
      if (v === null || v === '' || v === undefined) {
        delete base.expectedFormDurationMinutes;
      } else {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 5) {
          base[k] = Math.round(n / 5) * 5;
        }
      }
    }
  }

  return { settings: base, warnings };
}

/**
 * @param {Record<string, unknown>} s
 * @returns {string}
 */
function compactTemplateSettingsForPrompt(s) {
  if (!s || typeof s !== 'object') return '{}';
  const o = {
    requireGlobalGeofence: !!s.requireGlobalGeofence,
    globalGeofenceRadius: s.globalGeofenceRadius != null ? Number(s.globalGeofenceRadius) : 200,
    appFillMode: s.appFillMode != null ? String(s.appFillMode) : 'full',
    appSectionStart: s.appSectionStart != null ? String(s.appSectionStart) : 'direct',
    appHubSectionOrder: s.appHubSectionOrder != null ? String(s.appHubSectionOrder) : 'free',
  };
  if (s.expectedFormDurationMinutes != null && s.expectedFormDurationMinutes !== '') {
    o.expectedFormDurationMinutes = s.expectedFormDurationMinutes;
  }
  try {
    return JSON.stringify(o);
  } catch {
    return '{}';
  }
}

module.exports = {
  applyTemplateSettingsPatch,
  compactTemplateSettingsForPrompt,
  ALLOWED_KEYS,
};
