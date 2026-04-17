'use strict';

/**
 * AuditLog: contas Admin legadas usam adminId; login por tenant (User) usa userId.
 */
function auditActor(req) {
  const a = req.admin;
  if (!a) return { adminId: null, userId: null };
  if (a.panelUser && a.userId) return { adminId: null, userId: a.userId };
  return { adminId: a.id || null, userId: null };
}

function auditContextMetadata(req, extra = {}) {
  const authz = req?.authorization || {};
  const merged = {
    actorScope: authz.scope || null,
    actorRole: authz.roleKey || null,
    contextTenantId: authz.contextTenantId || null,
    ...extra,
  };
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
}

module.exports = { auditActor, auditContextMetadata };
