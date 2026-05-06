'use strict';

const prisma = require('../db');

const DEFAULT_API_BASE = 'https://api.mailersend.com/v1';

/**
 * Raiz da API REST MailerSend (mailersend.com) — padrão https://api.mailersend.com/v1
 * Ignora valores legados tipo smtp.mailersend.net:587 guardados como baseUrl.
 * @param {string|null|undefined} raw
 * @returns {string}
 */
function normalizeMailerSendApiBaseUrl(raw) {
  const def = DEFAULT_API_BASE;
  const s0 = String(raw || '').trim();
  if (!s0) return def;
  if (/smtp\.mailersend\.net/i.test(s0) || /^[\w.-]+:\d{2,5}$/.test(s0)) return def;
  let s = s0.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = (u.hostname || '').toLowerCase();
    if (!host.endsWith('mailersend.com')) return def;
    let p = (u.pathname || '').replace(/\/+$/, '');
    if (!p || p === '/') p = '/v1';
    if (!/\/v\d+/i.test(p)) p = `${p}/v1`.replace(/\/+/g, '/');
    return `${u.protocol}//${u.host}${p}`;
  } catch {
    return def;
  }
}

/**
 * Token / URL MailerSend: integração «MailerSend» (EMAIL) na BD; senão MAILERSEND_* no .env.
 * Remetente (`from`) continua a ser lido do .env (domínio verificado no MailerSend).
 *
 * @returns {Promise<{ token: string, baseUrl: string, fromEmail: string, fromName: string, source: 'integration'|'env'|'partial' }>}
 */
async function resolveMailerSendConfig() {
  const envToken = String(process.env.MAILERSEND_API_TOKEN || '').trim();
  const envFrom = String(process.env.MAILERSEND_FROM_EMAIL || '').trim();
  const envName =
    String(process.env.MAILERSEND_FROM_NAME || process.env.MAILERSEND_FROM || 'Aria').trim() || 'Aria';
  const envBase = String(process.env.MAILERSEND_API_BASE || '').trim();

  let row = null;
  try {
    row = await prisma.integration.findFirst({
      where: { name: 'MailerSend', type: 'EMAIL' },
      orderBy: { updatedAt: 'desc' },
    });
  } catch (e) {
    console.warn('[mailersendCredentials] prisma:', e.message);
  }

  const intToken = row && row.apiKey ? String(row.apiKey).trim() : '';
  const token = intToken || envToken;

  let baseUrl = normalizeMailerSendApiBaseUrl(envBase || DEFAULT_API_BASE);
  if (row && String(row.baseUrl || '').trim()) {
    baseUrl = normalizeMailerSendApiBaseUrl(row.baseUrl);
  }

  const meta = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
  const fromMeta =
    meta.mailersendFromEmail != null ? String(meta.mailersendFromEmail).trim() : '';
  const nameMeta =
    meta.mailersendFromName != null ? String(meta.mailersendFromName).trim() : '';

  const fromEmail = fromMeta || envFrom;
  const fromName = nameMeta || envName;

  let source = 'none';
  if (intToken && fromEmail) source = 'integration';
  else if (envToken && envFrom) source = 'env';
  else if (intToken || envToken) source = 'partial';

  return { token, baseUrl, fromEmail, fromName, source };
}

module.exports = {
  DEFAULT_API_BASE,
  normalizeMailerSendApiBaseUrl,
  resolveMailerSendConfig,
};
