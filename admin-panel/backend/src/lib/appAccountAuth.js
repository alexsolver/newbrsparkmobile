'use strict';

const bcrypt = require('bcryptjs');

/** @param {string|null|undefined} kind */
function requiredAppRoleForTenantKind(kind) {
  const k = String(kind || '').toUpperCase();
  if (k === 'CLIENT') return 'USER';
  if (k === 'PROVIDER') return 'PROVIDER';
  return null;
}

/**
 * Garante que o papel do utilizador corresponde ao `Tenant.kind` (CLIENT → USER, PROVIDER → PROVIDER).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
async function ensureMembershipRoleMatchesTenantKind(prisma, userId) {
  const u = await prisma.user.findUnique({
    where: { id: String(userId || '').trim() },
    select: { id: true, role: true, tenant: { select: { kind: true } } },
  });
  if (!u || !u.tenant) return null;
  const required = requiredAppRoleForTenantKind(u.tenant.kind);
  if (!required) return u;
  const cur = String(u.role || '').toUpperCase();
  if (cur === required) return u;
  return prisma.user.update({
    where: { id: u.id },
    data: { role: required },
    select: { id: true, role: true, tenant: { select: { kind: true } } },
  });
}

/**
 * Verifica palavra-passe contra `AppAccount` ou, em legado, contra qualquer `User` com o mesmo e-mail.
 * Se não existir conta e um `User` corresponder, promove a `AppAccount` e liga todos os `User` do e-mail.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function verifyAppLoginPasswordAndEnsureAccount(prisma, emailNorm, plainPassword) {
  const em = String(emailNorm || '')
    .trim()
    .toLowerCase();
  if (!em || !plainPassword) return { ok: false };

  let account = await prisma.appAccount.findUnique({ where: { emailNorm: em } });
  if (account) {
    const ok = await bcrypt.compare(String(plainPassword), account.password);
    return ok ? { ok: true, account } : { ok: false };
  }

  const candidates = await prisma.user.findMany({
    where: { email: em, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, password: true },
  });
  for (const c of candidates) {
    const ok = await bcrypt.compare(String(plainPassword), c.password);
    if (!ok) continue;
    account = await prisma.$transaction(async (tx) => {
      const exists = await tx.appAccount.findUnique({ where: { emailNorm: em } });
      if (exists) return exists;
      const acc = await tx.appAccount.create({
        data: { emailNorm: em, password: c.password },
      });
      await tx.user.updateMany({
        where: { email: em },
        data: { appAccountId: acc.id, password: c.password },
      });
      return acc;
    });
    return { ok: true, account };
  }
  return { ok: false };
}

/**
 * Nova palavra-passe (hash) para a conta e todos os `User` ligados (ou mesmo e-mail em legado).
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function setUnifiedPasswordHashForEmail(prisma, emailNorm, newPasswordHash) {
  const em = String(emailNorm || '')
    .trim()
    .toLowerCase();
  if (!em || !newPasswordHash) return;
  const acc = await prisma.appAccount.findUnique({ where: { emailNorm: em } });
  if (acc) {
    await prisma.$transaction([
      prisma.appAccount.update({ where: { id: acc.id }, data: { password: newPasswordHash } }),
      prisma.user.updateMany({ where: { appAccountId: acc.id }, data: { password: newPasswordHash } }),
    ]);
    return;
  }
  await prisma.user.updateMany({ where: { email: em }, data: { password: newPasswordHash } });
}

/**
 * Hash canónico para o token de reset (conta ou utilizador).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string, password: string, appAccountId?: string|null }} user
 */
async function resolvePasswordHashForResetVersion(prisma, user) {
  if (user.appAccountId) {
    const acc = await prisma.appAccount.findUnique({
      where: { id: user.appAccountId },
      select: { password: true },
    });
    if (acc) return acc.password;
  }
  return user.password;
}

/**
 * Valida se o painel pode atribuir `nextRole` neste tenant.
 * @returns {string|null} mensagem de erro ou null se OK
 */
function validatePanelRoleForTenantKind(tenantKind, nextRole) {
  const k = String(tenantKind || '').toUpperCase();
  const r = String(nextRole || '').toUpperCase();
  if (k === 'CLIENT' && r !== 'USER') {
    return 'Em organizações «cliente» o papel do utilizador na app deve ser USER.';
  }
  if (k === 'PROVIDER' && r !== 'PROVIDER') {
    return 'Em organizações «prestador» o papel deve ser PROVIDER.';
  }
  return null;
}

module.exports = {
  requiredAppRoleForTenantKind,
  ensureMembershipRoleMatchesTenantKind,
  verifyAppLoginPasswordAndEnsureAccount,
  setUnifiedPasswordHashForEmail,
  resolvePasswordHashForResetVersion,
  validatePanelRoleForTenantKind,
};
