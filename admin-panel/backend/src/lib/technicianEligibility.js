'use strict';

const { resolveAppEffectiveTenantId } = require('./appLoginEffectiveTenant');
const { resolveFieldTaskOwnerEmailCandidatesForAppUser } = require('./userEmailUnique');

/** Papéis que podem receber OS/FT e RT (exclui apenas cliente final). Alinhado a `UserRole` no Prisma. */
const FIELD_TASK_ASSIGNEE_ROLES = ['PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'];

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

/** Técnico de empresa: `USER` com `TechnicianProfile` ACTIVE recebe OS como prestador de campo. */
function isActiveTechnicianUserRole(role, technicianStatus) {
  return normalizeRole(role) === 'USER' && normalizeRole(technicianStatus) === 'ACTIVE';
}

function userRowEligibleForFieldTasks(row) {
  if (!row) return false;
  const r = normalizeRole(row.role);
  if (FIELD_TASK_ASSIGNEE_ROLES.includes(r)) return true;
  return isActiveTechnicianUserRole(r, row.technicianProfile?.status);
}

/**
 * Prestador «clássico» = usuário ativo com TechnicianProfile em estado ACTIVE.
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
 * Resolve o e-mail canônico do usuário que pode receber FT/OS e RT (ativo, não cliente).
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

/**
 * App móvel (JWT já corrigido por `authUser` com `resolveAppEffectiveTenantId`):
 * o `User.tenantId` pode ser a org «casa» do prestador, enquanto a sessão opera na org
 * DEDICATED (cliente). `canReceiveFieldTasksForEmail` exigia linha User com `tenantId` = org
 * efetiva e devolvia falso — `/api/sync/tasks` vinha vazio e a central mostrava «Aguardando Envio».
 *
 * @param {{ userId: string, email: string, effectiveTenantId: string }} opts
 */
async function canReceiveFieldTasksForAppSession(db, opts) {
  const userId = String(opts?.userId || '').trim();
  const email = String(opts?.email || '').trim();
  const tid = String(opts?.effectiveTenantId || '').trim();
  if (!userId || !email || !tid) return false;

  /**
   * O JWT do app usa `AppAccount.emailNorm` (canónico); a linha `User` pode ter e-mail sintético
   * (`+brspark.ws.…`) noutro workspace. Não exigir `User.email === ownerEmail` — validar contra
   * candidatos de sync (`resolveFieldTaskOwnerEmailCandidatesForAppUser`).
   */
  const u = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, role: true, technicianProfile: { select: { status: true } } },
  });
  if (!u || !userRowEligibleForFieldTasks(u)) return false;

  const candidates = await resolveFieldTaskOwnerEmailCandidatesForAppUser(db, userId);
  const en = email.toLowerCase();
  const emailOk = candidates.some((c) => String(c || '').trim().toLowerCase() === en);
  if (!emailOk) return false;

  const eff = await resolveAppEffectiveTenantId(db, userId);
  return String(eff || '').trim() === tid;
}

module.exports = {
  FIELD_TASK_ASSIGNEE_ROLES,
  isActiveTechnicianForEmail,
  isActiveTechnicianUserRole,
  userRowEligibleForFieldTasks,
  resolveFieldTaskAssigneeEmail,
  canReceiveFieldTasksForEmail,
  canReceiveFieldTasksForAppSession,
};
