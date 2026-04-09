'use strict';

/**
 * Monta o caminho e, se configurado, a URL absoluta do formulário público de avaliação.
 * ADMIN_PANEL_PUBLIC_BASE_URL — origem/pasta onde está evaluation-survey.html, sem barra final.
 * Ex.: https://admin.empresa.com ou https://app.empresa.com/brspark/admin-panel
 */
function normalizeBaseUrl(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function buildClientSurveyLinks(publicToken) {
  if (!publicToken || typeof publicToken !== 'string') {
    return { relativePath: null, fullUrl: null };
  }
  const relativePath = `evaluation-survey.html?token=${encodeURIComponent(publicToken)}`;
  const base = normalizeBaseUrl(process.env.ADMIN_PANEL_PUBLIC_BASE_URL);
  const fullUrl = base ? `${base}/${relativePath}` : null;
  return { relativePath, fullUrl };
}

module.exports = { buildClientSurveyLinks, normalizeBaseUrl };
