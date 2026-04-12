'use strict';

/** Papéis que podem receber OS/FT e RT (exclui apenas cliente final). Alinhado a `UserRole` no Prisma. */
const FIELD_TASK_ASSIGNEE_ROLES = ['PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'];

/**
 * Prestador «clássico» = utilizador ativo com TechnicianProfile CompreFace ACTIVE.
 * Mantido para fluxos que ainda exigem perfil técnico (ex.: identidade / algumas políticas).
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 */
async function isActiveTechnicianForEmail(db, email, tenantId) {
  const e = String(email || '').trim();
  if (!e) return false;
  const where = {
    isActive: true,
    email: { equals: e, mode: 'insensitive' },
    technicianProfile: { status: 'ACTIVE' },
  };
  if (tenantId) where.tenantId = tenantId;
  const row = await db.user.findFirst({ where, select: { id: true } });
  return !!row;
}

const baseEligibleWhere = (emailNorm) => ({
  isActive: true,
  email: { equals: emailNorm, mode: 'insensitive' },
  /** Apenas `USER` (cliente) fica de fora de OS/FT e RT. */
  role: { in: FIELD_TASK_ASSIGNEE_ROLES },
});

/**
 * Resolve o e-mail canónico do utilizador que pode receber FT/OS e RT (ativo, não cliente).
 * @returns {Promise<string|null>} e-mail na base ou null se inelegível / ambíguo sem tenant.
 */
async function resolveFieldTaskAssigneeEmail(db, email, tenantId) {
  const e = String(email || '').trim();
  if (!e) return null;

  if (tenantId) {
    const row = await db.user.findFirst({
      where: { ...baseEligibleWhere(e), tenantId },
      select: { email: true },
    });
    return row?.email ? String(row.email).trim() : null;
  }

  const rows = await db.user.findMany({
    where: baseEligibleWhere(e),
    select: { email: true, tenantId: true },
    take: 2,
  });
  if (rows.length === 1) return String(rows[0].email || '').trim() || null;
  return null;
}

async function canReceiveFieldTasksForEmail(db, email, tenantId) {
  return !!(await resolveFieldTaskAssigneeEmail(db, email, tenantId));
}

module.exports = {
  FIELD_TASK_ASSIGNEE_ROLES,
  isActiveTechnicianForEmail,
  resolveFieldTaskAssigneeEmail,
  canReceiveFieldTasksForEmail,
};
