'use strict';

/**
 * Valida id_token / access_token no Laravel (fonte da verdade OAuth).
 * Requer as mesmas variáveis que o diretório CMS: CMS_DIRECTORY_BASE_URL + CMS_INTERNAL_API_TOKEN.
 */

function cmsBase() {
  return (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
}

function internalToken() {
  return (process.env.CMS_INTERNAL_API_TOKEN || '').trim();
}

/**
 * @param {{ provider: string, idToken?: string, accessToken?: string }} params
 * @returns {Promise<{ ok: true, profile: object } | { ok: false, reason?: string, status?: number, body?: object }>}
 */
async function verifyOAuthWithLaravel(params) {
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return { ok: false, reason: 'not_configured' };
  }

  const url = `${base}/api/internal/oauth/verify`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider: params.provider,
        id_token: params.idToken,
        access_token: params.accessToken,
      }),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => '');
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text.slice(0, 200) };
  }

  if (!res.ok) {
    return { ok: false, status: res.status, body };
  }
  return { ok: true, profile: body };
}

module.exports = { verifyOAuthWithLaravel };
