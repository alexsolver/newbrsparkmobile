'use strict';

/**
 * Nome de integração canónico (espaços múltiplos, NBSP, zero‑width).
 * @param {unknown} v
 * @returns {string}
 */
function normIntegrationNameKey(v) {
  return String(v ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function isGoogleMapsPlatformName(name) {
  const key = normIntegrationNameKey(name);
  if (key === 'GOOGLE MAPS PLATFORM') return true;
  if (key.startsWith('GOOGLE MAPS PLATFORM')) return true;
  return /^GOOGLE\s+MAPS\s+PLATFORM\b/i.test(String(name ?? '').replace(/\uFEFF/g, '').trim());
}

module.exports = { normIntegrationNameKey, isGoogleMapsPlatformName };
