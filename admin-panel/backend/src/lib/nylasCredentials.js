'use strict';

const prisma = require('../db');

const DEFAULT_API_URI = 'https://api.us.nylas.com';

/**
 * Normaliza a URI base da API Nylas v3 (US, EU, etc.), sem barra no fim.
 * @param {string} [raw]
 * @returns {string}
 */
function normalizeNylasApiUri(raw) {
  let s = String(raw || DEFAULT_API_URI).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/+/, '')}`;
  }
  try {
    const u = new URL(s);
    if (!u.hostname) return DEFAULT_API_URI;
    return `${u.protocol}//${u.host}`;
  } catch {
    return DEFAULT_API_URI;
  }
}

/**
 * Hostname para https.request (sem path).
 * @param {string} apiUri
 * @returns {string}
 */
function nylasApiHostname(apiUri) {
  try {
    return new URL(normalizeNylasApiUri(apiUri)).hostname;
  } catch {
    return 'api.us.nylas.com';
  }
}

/**
 * Credenciais Nylas: integração "Nylas" (EMAIL) na BD; senão NYLAS_API_KEY / NYLAS_API_URI no .env.
 *
 * @returns {Promise<{ apiKey: string, apiUri: string, source: 'integration'|'env'|'none' }>}
 */
async function resolveNylasCredentials() {
  const envKey = (process.env.NYLAS_API_KEY && String(process.env.NYLAS_API_KEY).trim()) || '';
  const envUri = (process.env.NYLAS_API_URI && String(process.env.NYLAS_API_URI).trim()) || '';

  let row = null;
  try {
    row = await prisma.integration.findFirst({
      where: { name: 'Nylas', type: 'EMAIL' },
      orderBy: { updatedAt: 'desc' },
    });
  } catch (e) {
    console.warn('[nylasCredentials] prisma:', e.message);
  }

  const intKey = row && row.apiKey ? String(row.apiKey).trim() : '';
  const apiKey = intKey || envKey;

  let apiUri = normalizeNylasApiUri(envUri || DEFAULT_API_URI);
  if (row && String(row.baseUrl || '').trim()) {
    apiUri = normalizeNylasApiUri(row.baseUrl);
  }

  const source = intKey ? 'integration' : envKey ? 'env' : 'none';

  return { apiKey, apiUri, source };
}

module.exports = {
  normalizeNylasApiUri,
  nylasApiHostname,
  resolveNylasCredentials,
  DEFAULT_API_URI,
};
