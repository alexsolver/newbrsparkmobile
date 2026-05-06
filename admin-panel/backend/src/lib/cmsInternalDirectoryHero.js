'use strict';

/**
 * Chamadas autenticadas por token ao Laravel (banner do diretório público).
 * Requer CMS_DIRECTORY_BASE_URL + CMS_INTERNAL_API_TOKEN (igual a ARIA_INTERNAL_API_TOKEN no Laravel).
 */

function cmsBase() {
  return (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
}

function internalToken() {
  return (process.env.CMS_INTERNAL_API_TOKEN || '').trim();
}

function configured() {
  return Boolean(cmsBase() && internalToken());
}

/**
 * @param {string} ownerEmail
 * @returns {Promise<{ ok: true, data: object } | { ok: false, reason: 'not_configured' } | { ok: false, status: number, body: object }>}
 */
async function getDirectoryHero(ownerEmail) {
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return { ok: false, reason: 'not_configured' };
  }

  const url = `${base}/api/internal/directory-hero?owner_email=${encodeURIComponent(ownerEmail)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
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
  return { ok: true, data: body };
}

/**
 * @param {string} ownerEmail
 * @param {string|null|undefined} heroImageUrl
 */
async function putDirectoryHero(ownerEmail, heroImageUrl) {
  const base = cmsBase();
  const token = internalToken();
  if (!base || !token) {
    return { ok: false, reason: 'not_configured' };
  }

  const url = `${base}/api/internal/directory-hero`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  let res;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        owner_email: ownerEmail,
        hero_image_url: heroImageUrl == null || heroImageUrl === '' ? null : String(heroImageUrl),
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
  return { ok: true, data: body };
}

module.exports = { configured, getDirectoryHero, putDirectoryHero };
