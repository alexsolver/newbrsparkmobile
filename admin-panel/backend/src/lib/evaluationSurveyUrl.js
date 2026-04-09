'use strict';

/**
 * Monta o caminho e, se configurado, a URL absoluta do formulário público de avaliação.
 * ADMIN_PANEL_PUBLIC_BASE_URL — origem/pasta onde está evaluation-survey.html, sem barra final.
 * Ex.: https://admin.empresa.com ou https://app.empresa.com/brspark/admin-panel
 *
 * Em desenvolvimento, se ADMIN_PANEL_PUBLIC_BASE_URL estiver vazio, usa o primeiro origin
 * de CORS_ORIGIN (ex.: Live Server do painel em http://localhost:5500).
 * Em produção só entra URL explícita — evita assumir que o origin CORS serve o HTML estático.
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

function resolveSurveyPublicBase() {
  const primary = normalizeBaseUrl(process.env.ADMIN_PANEL_PUBLIC_BASE_URL);
  if (primary) return primary;
  if (process.env.NODE_ENV === 'production') return '';
  const corsFirst = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .find((s) => s && s !== '*');
  return normalizeBaseUrl(corsFirst || '');
}

function buildClientSurveyLinks(publicToken) {
  if (!publicToken || typeof publicToken !== 'string') {
    return { relativePath: null, fullUrl: null };
  }
  const relativePath = `evaluation-survey.html?token=${encodeURIComponent(publicToken)}`;
  const base = resolveSurveyPublicBase();
  const fullUrl = base ? `${base}/${relativePath}` : null;
  return { relativePath, fullUrl };
}

module.exports = { buildClientSurveyLinks, normalizeBaseUrl, resolveSurveyPublicBase };
