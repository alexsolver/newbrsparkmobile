'use strict';

const prisma = require('../db');

const DEFAULT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * @param {string|null|undefined} raw
 * @returns {string}
 */
function normalizeMicrosoftGraphApiBaseUrl(raw) {
  const def = DEFAULT_GRAPH_BASE;
  const s0 = String(raw || '').trim().replace(/\/+$/, '');
  if (!s0) return def;
  let s = s0;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    const host = (u.hostname || '').toLowerCase();
    if (!host.includes('graph.microsoft')) return def;
    let path = (u.pathname || '').replace(/\/+$/, '') || '';
    if (!path || path === '/') path = '/v1.0';
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return def;
  }
}

/**
 * Extrai configuração a partir de uma linha `Integration` (campos sensíveis completos).
 * @param {object|null|undefined} row
 * @returns {{ ready: boolean, tenantId?: string, clientId?: string, clientSecret?: string, sendAsUser?: string, fromName?: string, graphBase?: string, source?: string }}
 */
function configFromIntegrationRow(row) {
  if (!row) return { ready: false, source: 'none' };
  const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {};
  const tenantId = String(meta.microsoftTenantId || '').trim();
  const clientId = String(meta.microsoftClientId || '').trim();
  const clientSecret = String(row.apiKey || '').trim();
  const sendAsUser = String(meta.microsoftSendAsUser || '').trim();
  const fromName =
    String(meta.microsoftFromName != null ? meta.microsoftFromName : 'BrSpark').trim() || 'BrSpark';
  const graphBase = normalizeMicrosoftGraphApiBaseUrl(row.baseUrl);
  if (!tenantId || !clientId || !clientSecret || !sendAsUser) {
    return {
      ready: false,
      source: 'partial',
      tenantId,
      clientId,
      clientSecret,
      sendAsUser,
      fromName,
      graphBase,
    };
  }
  return {
    ready: true,
    tenantId,
    clientId,
    clientSecret,
    sendAsUser,
    fromName,
    graphBase,
    source: 'integration',
  };
}

/**
 * App registration (daemon) + permissão de aplicação Mail.Send na caixa `microsoftSendAsUser`.
 * Integração «Microsoft Graph» (EMAIL) na BD ou variáveis MICROSOFT_GRAPH_* no .env.
 *
 * @returns {Promise<object>} configFromIntegrationRow + source env|integration|none
 */
async function resolveMicrosoftGraphConfig() {
  let row = null;
  try {
    row = await prisma.integration.findFirst({
      where: { name: 'Microsoft Graph', type: 'EMAIL' },
      orderBy: { updatedAt: 'desc' },
    });
  } catch (e) {
    console.warn('[microsoftGraphCredentials] prisma:', e.message);
  }

  const fromRow = configFromIntegrationRow(row);
  if (fromRow.ready) return fromRow;

  const tenantId = String(process.env.MICROSOFT_GRAPH_TENANT_ID || '').trim();
  const clientId = String(process.env.MICROSOFT_GRAPH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MICROSOFT_GRAPH_CLIENT_SECRET || '').trim();
  const sendAsUser = String(process.env.MICROSOFT_GRAPH_SEND_AS_USER || '').trim();
  const fromName =
    String(process.env.MICROSOFT_GRAPH_FROM_NAME || 'BrSpark').trim() || 'BrSpark';
  const graphBase = normalizeMicrosoftGraphApiBaseUrl(process.env.MICROSOFT_GRAPH_API_BASE);
  if (tenantId && clientId && clientSecret && sendAsUser) {
    return {
      ready: true,
      tenantId,
      clientId,
      clientSecret,
      sendAsUser,
      fromName,
      graphBase,
      source: 'env',
    };
  }

  return { ready: false, source: fromRow.source === 'partial' ? 'partial' : 'none' };
}

module.exports = {
  DEFAULT_GRAPH_BASE,
  normalizeMicrosoftGraphApiBaseUrl,
  configFromIntegrationRow,
  resolveMicrosoftGraphConfig,
};
