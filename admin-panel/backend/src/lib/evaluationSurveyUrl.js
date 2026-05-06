'use strict';

/**
 * Monta o caminho e, se configurado, a URL absoluta do formulário público de avaliação.
 * ADMIN_PANEL_PUBLIC_BASE_URL — origem/pasta onde está evaluation-survey.html, sem barra final.
 * Ex.: https://admin.empresa.com ou https://app.empresa.com/aria/admin-panel
 *
 * Em desenvolvimento, sem URL explícita, usa a **mesma porta que o processo Node** (`PORT`, default 3001).
 * Não usar `CORS_ORIGIN` como base: costuma listar outra porta (ex. 3002) ou o Live Server, gerando links errados.
 * Em produção só entra URL explícita — evita assumir host público.
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
  const alias = normalizeBaseUrl(process.env.PUBLIC_PANEL_URL || process.env.ADMIN_PANEL_PUBLIC_URL);
  if (alias) return alias;
  if (process.env.NODE_ENV === 'production') return '';
  const port = String(process.env.PORT || '3001').trim() || '3001';
  return normalizeBaseUrl(`http://127.0.0.1:${port}`);
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
