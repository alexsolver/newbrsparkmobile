'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { enforcePanelPermissions } = require('./panelPermissions');
const { buildAdminAuthorization } = require('../lib/authorization');
const { continueWithRlsTransaction } = require('./prismaRlsRequestContext');

function copyPanelContextFromPayload(payload) {
  const ptid = payload.panelContextTenantId != null ? String(payload.panelContextTenantId).trim() : '';
  if (!ptid) {
    return {
      panelContextTenantId: null,
      panelContextTenantSlug: null,
      panelContextTenantName: null,
      panelContextTenantKind: null,
    };
  }
  return {
    panelContextTenantId: ptid,
    panelContextTenantSlug: payload.panelContextTenantSlug || null,
    panelContextTenantName: payload.panelContextTenantName || null,
    panelContextTenantKind: payload.panelContextTenantKind || null,
  };
}

function attachAdminFromPayload(payload) {
  const panelCtx = copyPanelContextFromPayload(payload);
  if (payload.panel === true && payload.userId) {
    return {
      panelUser: true,
      id: null,
      userId: payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      tenantSlug: payload.tenantSlug,
      tenantName: payload.tenantName,
      impersonation: !!payload.impersonation,
      impersonatorUserId: payload.impersonatorUserId || null,
      impersonatorEmail: payload.impersonatorEmail || null,
      impersonatorLegacyAdminId: payload.impersonatorLegacyAdminId || null,
      ...panelCtx,
    };
  }
  return {
    panelUser: false,
    id: payload.id,
    userId: null,
    tenantId: null,
    email: payload.email,
    name: payload.name,
    role: null,
    tenantSlug: null,
    tenantName: null,
    ...panelCtx,
  };
}

/**
 * Valida Bearer admin e preenche `req.admin` / `req.authorization`.
 * @returns {boolean} `false` se já respondeu 401.
 */
function loadAdminBearerOr401(req, res) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return false;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = attachAdminFromPayload(payload);
    req.authorization = buildAdminAuthorization(req.admin);
    return true;
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
    return false;
  }
}

function adminAuth(req, res, next) {
  if (!loadAdminBearerOr401(req, res)) return;
  next();
}

/** Autenticação admin + restrições do perfil Gestor (MANAGER) + transacção RLS por pedido. */
async function adminAuthThenPanel(req, res, next) {
  if (!loadAdminBearerOr401(req, res)) return;
  if (!enforcePanelPermissions(req, res, null)) return;
  await continueWithRlsTransaction(req, res, next);
}

/** Admin JWT + transacção RLS (rotas isoladas sem `enforcePanelPermissions`). */
async function adminAuthThenRls(req, res, next) {
  if (!loadAdminBearerOr401(req, res)) return;
  await continueWithRlsTransaction(req, res, next);
}

/**
 * Admin JWT OU Bearer igual a REPORTS_API_KEY (integrações externas).
 */
async function adminOrReportsApiKey(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }
  const token = header.slice(7).trim();
  const reportsKey = process.env.REPORTS_API_KEY && String(process.env.REPORTS_API_KEY).trim();
  if (reportsKey && reportsKey.length > 0 && token.length === reportsKey.length) {
    try {
      const a = Buffer.from(token, 'utf8');
      const b = Buffer.from(reportsKey, 'utf8');
      if (crypto.timingSafeEqual(a, b)) {
        req.reportsApiKeyAuth = true;
        req.admin = null;
        req.authorization = null;
        return continueWithRlsTransaction(req, res, next, { reportsApiKey: true });
      }
    } catch {
      /* timingSafeEqual só com buffers do mesmo comprimento */
    }
  }
  if (!loadAdminBearerOr401(req, res)) return;
  return continueWithRlsTransaction(req, res, next);
}

/**
 * Recusa de OS a partir do app (Live Activity / push) ou do painel.
 * Aceita JWT de utilizador do app (`sessionId` no payload) ou JWT do painel / admin legado (via `adminAuth` + permissões).
 */
async function rejectOsAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }
  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  if (payload.panel === true && payload.userId) {
    req.admin = attachAdminFromPayload(payload);
    req.authorization = buildAdminAuthorization(req.admin);
    if (!enforcePanelPermissions(req, res, null)) return;
    return continueWithRlsTransaction(req, res, next);
  }
  if (payload.sessionId != null && payload.id) {
    req.appUser = {
      id: payload.id,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
    };
    return continueWithRlsTransaction(req, res, next);
  }
  req.admin = attachAdminFromPayload(payload);
  req.authorization = buildAdminAuthorization(req.admin);
  return continueWithRlsTransaction(req, res, next);
}

module.exports = {
  adminAuth,
  adminAuthThenPanel,
  adminAuthThenRls,
  adminOrReportsApiKey,
  rejectOsAuth,
  attachAdminFromPayload,
};
