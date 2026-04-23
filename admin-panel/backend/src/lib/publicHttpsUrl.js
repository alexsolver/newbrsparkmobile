'use strict';

/**
 * URLs públicas absolutas em `http://` falham no iOS (ATS) quando o host é Internet.
 * Mantém `http://` para localhost e redes privadas (dev em LAN sem TLS).
 */

function trimTrailingSlashes(s) {
  return String(s || '')
    .trim()
    .replace(/\/+$/, '');
}

function isPrivateOrLocalHost(hostname) {
  if (!hostname) return true;
  const h = String(hostname).toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

/**
 * @param {string | null | undefined} url
 * @returns {string | null | undefined}
 */
function ensureHttpsUrlForPublicInternet(url) {
  if (url == null) return url;
  const s = String(url).trim();
  if (!s) return s;
  if (s.startsWith('/')) return s;
  if (!/^https?:\/\//i.test(s)) return s;
  let u;
  try {
    u = new URL(/^\/\//i.test(s) ? `https:${s}` : s);
  } catch {
    return s;
  }
  if (u.protocol !== 'http:') return s;
  if (isPrivateOrLocalHost(u.hostname)) return s;
  u.protocol = 'https:';
  return u.toString();
}

/**
 * Origem pública da API para montar URLs absolutas de uploads locais.
 * Prioridade: PUBLIC_API_BASE → API_BASE_URL → Host do pedido (respeita X-Forwarded-Proto).
 * Em host público, evita gravar `http://` quando o cliente está atrás de TLS (terminador).
 *
 * @param {import('express').Request | null | undefined} req
 * @returns {string}
 */
function resolvePublicApiOriginForUploads(req) {
  const candidates = [process.env.PUBLIC_API_BASE, process.env.API_BASE_URL].map(trimTrailingSlashes).filter(Boolean);
  for (const raw of candidates) {
    try {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      let u = new URL(withScheme);
      if (u.protocol === 'http:' && !isPrivateOrLocalHost(u.hostname)) {
        u = new URL(String(raw).replace(/^http:\/\//i, 'https://'));
      }
      return `${u.protocol}//${u.host}`;
    } catch {
      /* continuar */
    }
  }
  if (req && typeof req.get === 'function') {
    const hostHeader = String(req.get('host') || '').trim();
    if (hostHeader) {
      const hostOnly = hostHeader.split(':')[0] || '';
      const hdr = req.headers && (req.headers['x-forwarded-proto'] || req.headers['X-Forwarded-Proto']);
      const xf = String(hdr || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      let proto =
        xf === 'https' ? 'https' : xf === 'http' ? 'http' : String(req.protocol || 'http').toLowerCase();
      if (proto === 'http' && !isPrivateOrLocalHost(hostOnly)) {
        proto = 'https';
      }
      if (proto === 'http' && String(process.env.TRUST_PROXY_TLS || '').trim() === '1') {
        proto = 'https';
      }
      return `${proto}://${hostHeader}`;
    }
  }
  return 'http://127.0.0.1:3001';
}

module.exports = {
  ensureHttpsUrlForPublicInternet,
  resolvePublicApiOriginForUploads,
  isPrivateOrLocalHost,
};
