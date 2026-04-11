'use strict';

/**
 * Cliente HTTP para o diretório público do BrsparkWeb (Laravel).
 * Quando CMS_DIRECTORY_BASE_URL está definido, /api/providers do Node faz de BFF.
 */

async function fetchProvidersFromCms(searchParams) {
  const base = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
  if (!base) return null;

  const url = `${base}/api/public/directory/providers?${searchParams.toString()}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CMS directory HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

module.exports = { fetchProvidersFromCms };
