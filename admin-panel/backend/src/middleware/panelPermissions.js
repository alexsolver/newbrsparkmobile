'use strict';

const { hasCapability, isPlatformAdmin, normalizeRole } = require('../lib/authorization');

/** Papéis com acesso total às rotas do painel (montadas com adminAuth). */
const FULL_PANEL_ACCESS_ROLES = new Set(['SAAS_ADMIN', 'TENANT_ADMIN']);

/**
 * Prefixos de URL permitidos ao perfil Gestor (MANAGER) — alinhados ao menu
 * Gestão + Operações (+ storage para uploads do builder de formulários).
 */
const MANAGER_ALLOWED_PREFIXES = [
  '/api/auth',
  '/api/dashboard',
  '/api/stock-critical',
  '/api/tenants',
  '/api/users',
  '/api/locations',
  '/api/work-time',
  '/api/technician-registration',
  '/api/plans',
  '/api/subscriptions',
  '/api/checklists',
  '/api/docs',
  '/api/operations',
  '/api/admin/routine-tasks',
  '/api/reports',
  '/api/cockpit',
  '/api/admin/evaluations',
  '/api/storage',
  '/api/i18n',
];

function pathAllowedForManager(originalUrl) {
  const path = String(originalUrl || '').split('?')[0];
  return MANAGER_ALLOWED_PREFIXES.some(
    (pre) => path === pre || path.startsWith(`${pre}/`)
  );
}

/**
 * Depois de `adminAuth` (ou equivalente que preencha `req.admin`).
 * - Conta Admin legada (`!panelUser`): sem alteração.
 * - SAAS_ADMIN / TENANT_ADMIN: acesso total.
 * - MANAGER: só prefixos em MANAGER_ALLOWED_PREFIXES.
 */
function enforcePanelPermissions(req, res, next) {
  const a = req.admin;
  const authz = req.authorization;
  if (!a) return next();
  if (!a.panelUser) return next();
  if (isPlatformAdmin(authz)) return next();
  const role = normalizeRole(a.role);
  if (FULL_PANEL_ACCESS_ROLES.has(role) && hasCapability(authz, 'tenant.access.self')) return next();
  if (role === 'MANAGER') {
    if (pathAllowedForManager(req.originalUrl)) return next();
    return res.status(403).json({
      error: 'Sem permissão para este recurso (perfil Gestor).',
    });
  }
  return res.status(403).json({ error: 'Sem permissão para este recurso.' });
}

module.exports = {
  enforcePanelPermissions,
  pathAllowedForManager,
  FULL_PANEL_ACCESS_ROLES,
  MANAGER_ALLOWED_PREFIXES,
};
