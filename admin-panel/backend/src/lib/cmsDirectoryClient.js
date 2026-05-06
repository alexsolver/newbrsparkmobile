'use strict';

/**
 * Cliente HTTP para o diretório público do AriaWeb (Laravel).
 * Com CMS_DIRECTORY_BASE_URL, /api/providers do Node faz de BFF ao Laravel.
 * Sem fallback em PostgreSQL salvo DIRECTORY_POSTGRES_FALLBACK=1 no backend.
 * O CMS devolve uma linha por profissional com vitrine (`listed_in_app`), não agregada só por tenant.
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

/**
 * Detalhe de uma empresa no diretório público (mesmo contrato que `GET …/providers/{id}` no Laravel).
 * @param {string} id UUID do tenant ou do profissional listado (compatível com o CMS).
 */
async function fetchProviderDetailFromCms(id) {
  const base = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
  if (!base) return null;

  const safe = encodeURIComponent(String(id || '').trim());
  if (!safe) return null;

  const url = `${base}/api/public/directory/providers/${safe}`;
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

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const err = new Error(`CMS provider detail HTTP ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    const err = new Error('Resposta inválida do CMS (JSON).');
    err.status = 502;
    throw err;
  }
}

async function fetchCategoriesFromCms() {
  const base = (process.env.CMS_DIRECTORY_BASE_URL || '').replace(/\/$/, '');
  if (!base) return null;

  const url = `${base}/api/public/directory/categories`;
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
    throw new Error(`CMS categories HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

module.exports = {
  fetchProvidersFromCms,
  fetchCategoriesFromCms,
  fetchProviderDetailFromCms,
};
