'use strict';

/**
 * URL pública da página estática `provider-onboard.html` (admin-panel),
 * alinhada ao modelo de `track.html` — mesma origem que a API Node quando possível.
 */

const { normalizeBaseUrl } = require('./evaluationSurveyUrl');
const { ensureHttpsUrlForPublicInternet, isPrivateOrLocalHost } = require('./publicHttpsUrl');

const PATH_PAGE = '/provider-onboard.html';
const JOIN_FIRST_PROVIDER_PATH = '/join-as-provider.html';

function trimTrailingSlashes(s) {
  return String(s || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * Origem base (sem path) para convites e callback Didit.
 * @param {import('express').Request | null | undefined} [req]
 */
function resolveProviderWebOnboardingOrigin(req) {
  const explicit =
    trimTrailingSlashes(process.env.PROVIDER_WEB_ONBOARDING_BASE_URL) ||
    trimTrailingSlashes(process.env.WEB_PROVIDER_ONBOARDING_BASE_URL);
  if (explicit) {
    try {
      const u = new URL(/^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`);
      return ensureHttpsUrlForPublicInternet(u.origin) || explicit;
    } catch {
      return ensureHttpsUrlForPublicInternet(explicit) || explicit;
    }
  }

  const candidates = [
    process.env.TRACKING_PUBLIC_BASE_URL,
    process.env.PUBLIC_API_BASE,
    process.env.API_BASE_URL,
    process.env.ADMIN_PANEL_PUBLIC_BASE_URL,
    process.env.PUBLIC_PANEL_URL,
    process.env.ADMIN_PANEL_PUBLIC_URL,
  ];
  for (const raw of candidates) {
    const n = normalizeBaseUrl(raw);
    if (n) return ensureHttpsUrlForPublicInternet(n) || n;
  }

  if (req && typeof req.get === 'function') {
    const fwdHost = String(req.headers['x-forwarded-host'] || req.headers['X-Forwarded-Host'] || '')
      .split(',')[0]
      .trim();
    const hostHeader = String(fwdHost || req.get('host') || '').trim();
    if (hostHeader) {
      const xf = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      const hostOnly = hostHeader.split(':')[0] || '';
      let proto =
        xf === 'https' ? 'https' : xf === 'http' ? 'http' : String(req.protocol || 'http').toLowerCase();
      if (proto === 'http' && hostOnly && !isPrivateOrLocalHost(hostOnly)) {
        proto = 'https';
      }
      if (proto === 'http' && String(process.env.TRUST_PROXY_TLS || '').trim() === '1') {
        proto = 'https';
      }
      return ensureHttpsUrlForPublicInternet(`${proto}://${hostHeader}`) || `${proto}://${hostHeader}`;
    }
  }

  const port = String(process.env.PORT || '3001').trim() || '3001';
  return `http://127.0.0.1:${port}`;
}

/**
 * @param {string} originBase — origem sem barra final
 * @param {string} invitationToken
 */
function buildProviderOnboardPageUrl(originBase, invitationToken) {
  const base = trimTrailingSlashes(originBase);
  const tok = String(invitationToken || '').trim();
  if (!base || !tok) return '';
  const q = `token=${encodeURIComponent(tok)}`;
  const joined = `${base}${PATH_PAGE}?${q}`;
  return ensureHttpsUrlForPublicInternet(joined) || joined;
}

/**
 * Página web única para convite de primeiro cadastro (JWT global).
 * O visitante abre no browser e segue para a app com o mesmo token.
 */
function buildJoinAsProviderPageUrl(originBase, inviteJwt) {
  const base = trimTrailingSlashes(originBase);
  const tok = String(inviteJwt || '').trim();
  if (!base || !tok) return '';
  const joined = `${base}${JOIN_FIRST_PROVIDER_PATH}?inviteToken=${encodeURIComponent(tok)}`;
  return ensureHttpsUrlForPublicInternet(joined) || joined;
}

module.exports = {
  resolveProviderWebOnboardingOrigin,
  buildProviderOnboardPageUrl,
  buildJoinAsProviderPageUrl,
  PROVIDER_ONBOARD_PAGE_PATH: PATH_PAGE,
  JOIN_FIRST_PROVIDER_PAGE_PATH: JOIN_FIRST_PROVIDER_PATH,
};
