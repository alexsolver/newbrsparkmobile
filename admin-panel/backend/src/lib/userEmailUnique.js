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
    return `${local}+brspark.ws.${suf}@${domain}`;
  }
  return `ws-${suf}@brspark.internal.invalid`;
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

module.exports = {
  buildSyntheticUserEmail,
  allocateUniqueUserRowEmail,
  resolveCanonicalEmailNormForUser,
  resolveFieldTaskOwnerEmailCandidatesForAppUser,
};
