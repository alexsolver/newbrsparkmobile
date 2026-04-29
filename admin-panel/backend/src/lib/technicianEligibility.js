'use strict';

const {
  resolveCanonicalEmailNormForUser,
  resolveFieldTaskOwnerEmailCandidatesForAppUser,
} = require('./userEmailUnique');
const { normalizeEmail } = require('./fieldTaskExecutionAccess');

/** Único papel que pode receber e executar OS/FT e RT no app (alinhado a `UserRole` no Prisma). */
const FIELD_TASK_ASSIGNEE_ROLES = ['PROVIDER'];

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function userRowEligibleForFieldTasks(row) {
  if (!row) return false;
  return normalizeRole(row.role) === 'PROVIDER';
}

/**
 * Utilizador PROVIDER ativo para o e-mail (mesma regra que `resolveFieldTaskAssigneeEmail`).
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 */
async function isActiveTechnicianForEmail(db, email, tenantId) {
  return !!(await resolveFieldTaskAssigneeEmail(db, email, tenantId || undefined));
}

const baseEligibleWhere = (emailNorm) => ({
  isActive: true,
  email: { equals: emailNorm, mode: 'insensitive' },
  role: 'PROVIDER',
});

/**
 * E-mail a gravar em `ownerEmail` / despacho: preferir `AppAccount.emailNorm` (login) quando existir.
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 */
async function resolvedOwnerEmailForUserId(db, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const u = await db.user.findFirst({
    where: { id: uid },
    select: { email: true, appAccountId: true, appAccount: { select: { emailNorm: true } } },
  });
  if (!u) return null;
  const canon = await resolveCanonicalEmailNormForUser(db, u);
  if (canon) return canon;
  const raw = String(u.email || '').trim();
  return raw || null;
}

/**
 * Prestador PROVIDER ativo pelo login (`AppAccount.emailNorm` ou `User.email`), **sem** exigir
 * `ProviderTenantAffiliation` com a empresa do formulário. Quem tem vínculo dedicado com janelas
 * exclusivas é filtrado no despacho (`filterBroadcastCandidatesExcludingDedicatedAt`), não aqui.
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 */
async function resolveActiveProviderEmailGlobally(db, rawEmail) {
  const e = String(rawEmail || '').trim();
  if (!e) return null;
  const em = normalizeEmail(e);
  if (!em) return null;

  const acc = await db.appAccount.findUnique({
    where: { emailNorm: em },
    select: { id: true },
  });

  const userWhere = { isActive: true, role: 'PROVIDER' };
  if (acc?.id) {
    userWhere.appAccountId = String(acc.id);
  } else {
    userWhere.email = { equals: e, mode: 'insensitive' };
  }

  const users = await db.user.findMany({
    where: userWhere,
    select: { id: true },
    take: 24,
  });
  if (users.length !== 1) return null;
  return resolvedOwnerEmailForUserId(db, users[0].id);
}

/**
 * Resolve o e-mail canônico do utilizador PROVIDER ativo que pode receber FT/OS e RT.
 * @returns {Promise<string|null>} e-mail na base ou null se inelegível / ambíguo sem tenant.
 */
async function resolveFieldTaskAssigneeEmail(db, email, tenantId) {
  const e = String(email || '').trim();
  if (!e) return null;

  if (tenantId) {
    const row = await db.user.findFirst({
      where: { ...baseEligibleWhere(e), tenantId },
      select: { id: true, email: true },
    });
    if (row?.id) {
      const out = await resolvedOwnerEmailForUserId(db, row.id);
      if (out) return out;
    }
    return resolveActiveProviderEmailGlobally(db, e);
  }

  /** Sem tenant no modelo: não usar só `User.email` — prestadores na pool partilham e-mail sintético na linha. */
  return resolveActiveProviderEmailGlobally(db, e);
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
    select: { id: true, role: true },
  });
  if (!u || !userRowEligibleForFieldTasks(u)) return false;

  const candidates = await resolveFieldTaskOwnerEmailCandidatesForAppUser(db, userId);
  const en = email.toLowerCase();
  const emailOk = candidates.some((c) => String(c || '').trim().toLowerCase() === en);
  if (!emailOk) return false;

  /**
   * `req.user.tenantId` no middleware já vem de `resolveAppEffectiveTenantId` (ou fallback `User.tenantId`).
   * Recomparar `eff === tid` aqui era redundante e, em teoria, podia falhar por cache/TTL entre chamadas
   * — bloqueava `/api/sync/tasks` com [] sem o utilizador perceber o motivo.
   */
  return true;
}

module.exports = {
  FIELD_TASK_ASSIGNEE_ROLES,
  isActiveTechnicianForEmail,
  userRowEligibleForFieldTasks,
  resolveFieldTaskAssigneeEmail,
  canReceiveFieldTasksForEmail,
  canReceiveFieldTasksForAppSession,
};
