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

module.exports = { auditActor };
