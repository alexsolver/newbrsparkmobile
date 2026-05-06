'use strict';

const crypto = require('crypto');

/**
 * E-mail técnico único na coluna `User.email` para filiações adicionais do mesmo `AppAccount`
 * (o login continua a ser o `AppAccount.emailNorm`).
 */
function buildSyntheticUserEmail(loginEmailNorm, entropy) {
  const e = String(loginEmailNorm || '').trim().toLowerCase();
  const at = e.indexOf('@');
  const suf = String(entropy || '').replace(/[^a-z0-9]/gi, '').slice(0, 32) || crypto.randomBytes(8).toString('hex');
  if (at > 0) {
    const local = e.slice(0, at);
    const domain = e.slice(at + 1);
    return `${local}+aria.ws.${suf}@${domain}`;
  }
  return `ws-${suf}@aria.internal.invalid`;
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 */
async function allocateUniqueUserRowEmail(db, { appAccountId, loginEmailNorm }) {
  const norm = String(loginEmailNorm || '').trim().toLowerCase();
  if (!appAccountId) return norm;
  const n = await db.user.count({ where: { appAccountId: String(appAccountId) } });
  if (n === 0) return norm;
  for (let i = 0; i < 24; i++) {
    const candidate = buildSyntheticUserEmail(norm, `${Date.now()}${i}${Math.random().toString(36).slice(2, 10)}`);
    const clash = await db.user.findFirst({ where: { email: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  throw new Error('Não foi possível gerar e-mail técnico único para o novo utilizador.');
}

/**
 * E-mail canónico de login (AppAccount) para JWT, OTP e sync com `ownerEmail`.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id?: string|null, email?: string|null, appAccountId?: string|null, appAccount?: { emailNorm?: string|null }|null }} user
 */
async function resolveCanonicalEmailNormForUser(prisma, user) {
  if (user?.appAccount?.emailNorm) return String(user.appAccount.emailNorm).trim().toLowerCase();
  if (user?.appAccountId) {
    const acc = await prisma.appAccount.findUnique({
      where: { id: String(user.appAccountId) },
      select: { emailNorm: true },
    });
    if (acc?.emailNorm) return String(acc.emailNorm).trim().toLowerCase();
  }
  return String(user?.email || '').trim().toLowerCase();
}

/**
 * E-mails que devem bater com `ChecklistExecution.ownerEmail` para o utilizador autenticado no app:
 * linha `User.email`, canónico `AppAccount.emailNorm`, e demais linhas `User` do mesmo `AppAccount`
 * (ex.: e-mail técnico sintético + login real).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<string[]>} lista única em minúsculas
 */
async function resolveFieldTaskOwnerEmailCandidatesForAppUser(prisma, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const row = await prisma.user.findUnique({
    where: { id: uid },
    select: { email: true, appAccountId: true, appAccount: { select: { emailNorm: true } } },
  });
  if (!row) return [];
  const out = new Set();
  const rowEm = String(row.email || '').trim().toLowerCase();
  if (rowEm) out.add(rowEm);
  const canon = await resolveCanonicalEmailNormForUser(prisma, row);
  if (canon) out.add(canon);
  if (row.appAccountId) {
    const sibs = await prisma.user.findMany({
      where: { appAccountId: String(row.appAccountId), isActive: true },
      select: { email: true },
    });
    for (const s of sibs) {
      const em = String(s.email || '').trim().toLowerCase();
      if (em) out.add(em);
    }
  }
  return [...out];
}

/**
 * Utilizadores ativos para envio de push quando `ChecklistExecution.ownerEmail` (ou equivalente)
 * é o login canónico (`AppAccount.emailNorm`) mas a linha `User.email` é sintética (`+aria.ws.…`).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} db
 * @param {string} emailRaw
 * @returns {Promise<Array<{ id: string, tenantId: string|null }>>}
 */
async function resolveActiveUsersForDispatchOwnerEmail(db, emailRaw) {
  const em = String(emailRaw || '').trim();
  if (!em) return [];

  const out = new Map();
  const byRowEmail = await db.user.findMany({
    where: { isActive: true, email: { equals: em, mode: 'insensitive' } },
    select: { id: true, tenantId: true, appAccountId: true },
  });
  for (const row of byRowEmail) out.set(String(row.id), row);

  const norm = em.trim().toLowerCase();
  if (!norm) return [...out.values()];

  const acc = await db.appAccount.findUnique({
    where: { emailNorm: norm },
    select: { id: true },
  });
  const appAccountIds = new Set(
    [
      acc?.id ? String(acc.id) : '',
      ...byRowEmail.map((row) => String(row.appAccountId || '').trim()),
    ].filter(Boolean)
  );
  if (appAccountIds.size === 0) {
    return [...out.values()].map(({ appAccountId, ...row }) => row);
  }

  const viaAccount = await db.user.findMany({
    where: { appAccountId: { in: [...appAccountIds] }, isActive: true },
    select: { id: true, tenantId: true, appAccountId: true },
  });
  for (const row of viaAccount) out.set(String(row.id), row);
  return [...out.values()].map(({ appAccountId, ...row }) => row);
}

async function resolveActiveUserIdsForDispatchOwnerEmail(db, emailRaw, { tenantId } = {}) {
  const rows = await resolveActiveUsersForDispatchOwnerEmail(db, emailRaw);
  const preferTid = String(tenantId || '').trim();
  const preferred = preferTid ? rows.filter((r) => String(r.tenantId || '') === preferTid) : [];
  const picked = preferred.length ? preferred : rows;
  return picked.map((r) => String(r.id)).filter(Boolean);
}

async function resolvePreferredActiveUserForDispatchOwnerEmail(db, emailRaw, { tenantId, select, include } = {}) {
  const ids = await resolveActiveUserIdsForDispatchOwnerEmail(db, emailRaw, { tenantId });
  if (ids.length === 0) return null;
  const candidates = await db.user.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, role: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (candidates.length === 0) return null;
  const roleRank = (role) => {
    const r = String(role || '').toUpperCase();
    if (r === 'PROVIDER' || r === 'TECHNICIAN') return 0;
    if (r === 'MANAGER' || r === 'TENANT_ADMIN') return 1;
    return 2;
  };
  candidates.sort((a, b) => roleRank(a.role) - roleRank(b.role));
  const id = String(candidates[0].id);
  const args = {
    where: { id },
  };
  if (include) args.include = include;
  else if (select) args.select = select;
  return db.user.findUnique(args);
}

module.exports = {
  buildSyntheticUserEmail,
  allocateUniqueUserRowEmail,
  resolveCanonicalEmailNormForUser,
  resolveFieldTaskOwnerEmailCandidatesForAppUser,
  resolveActiveUsersForDispatchOwnerEmail,
  resolveActiveUserIdsForDispatchOwnerEmail,
  resolvePreferredActiveUserForDispatchOwnerEmail,
};
