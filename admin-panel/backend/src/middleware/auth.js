'use strict';
const jwt = require('jsonwebtoken');
const { enforcePanelPermissions } = require('./panelPermissions');

function attachAdminFromPayload(payload) {
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
  };
}

function adminAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = attachAdminFromPayload(payload);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/** Autenticação admin + restrições do perfil Gestor (MANAGER) nas rotas do painel. */
function adminAuthThenPanel(req, res, next) {
  adminAuth(req, res, () => enforcePanelPermissions(req, res, next));
}

/**
 * Admin JWT OU Bearer igual a REPORTS_API_KEY (integrações externas).
 */
function adminOrReportsApiKey(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação ausente.' });
  }
  const token = header.slice(7).trim();
  const reportsKey = process.env.REPORTS_API_KEY && String(process.env.REPORTS_API_KEY).trim();
  if (reportsKey && token === reportsKey) {
    req.reportsApiKeyAuth = true;
    return next();
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = attachAdminFromPayload(payload);
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = { adminAuth, adminAuthThenPanel, adminOrReportsApiKey };
