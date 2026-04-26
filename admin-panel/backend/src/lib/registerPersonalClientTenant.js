'use strict';

const { assertTechnicianSeatForNewUser } = require('./planQuotaService');

/**
 * E-mail técnico único para `Tenant.email` (o login do utilizador mantém o e-mail real).
 */
function syntheticTenantOwnerEmailForClientSpace(userEmail) {
  const e = String(userEmail || '').trim().toLowerCase();
  const at = e.indexOf('@');
  const tail = `cliente.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  if (at > 0) {
    const local = e.slice(0, at);
    const domain = e.slice(at + 1);
    return `${local}+brspark.${tail}@${domain}`;
  }
  return `cliente-${tail}@brspark.internal.invalid`;
}

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {{
 *   name: string,
 *   emailNorm: string,
 *   passwordHash: string,
 *   phone?: string|null,
 *   phoneVerifiedAt?: Date|null,
 *   auditAction: string,
 *   auditResource?: string|null,
 *   appAccountId?: string|null,
 * }} opts
 * @returns {Promise<{ tenant: import('@prisma/client').Tenant; user: import('@prisma/client').User & { tenant: any } }>}
 */
async function createPersonalClientTenantAndUserInTransaction(tx, opts) {
  const name = String(opts.name || '').trim();
  const emailNorm = String(opts.emailNorm || '').trim().toLowerCase();
  const passwordHash = String(opts.passwordHash || '');
  const auditAction = String(opts.auditAction || 'USER_REGISTER');
  const auditResource = opts.auditResource != null ? String(opts.auditResource) : emailNorm;
  const phone = opts.phone != null && String(opts.phone).trim() ? String(opts.phone).trim() : null;
  const phoneVerifiedAt = opts.phoneVerifiedAt != null ? opts.phoneVerifiedAt : null;
  const appAccountId = opts.appAccountId != null && String(opts.appAccountId).trim() ? String(opts.appAccountId).trim() : null;

  if (!name || !emailNorm || !passwordHash) {
    throw new Error('createPersonalClientTenantAndUser: name, emailNorm e passwordHash são obrigatórios.');
  }

  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug = `cliente-${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 10)}`.toLowerCase();
    const clash = await tx.tenant.findUnique({ where: { slug } });
    if (!clash) break;
  }
  const tenantEmail = syntheticTenantOwnerEmailForClientSpace(emailNorm);
  const tenantName = name;

  const tenant = await tx.tenant.create({
    data: {
      name: tenantName,
      slug,
      email: tenantEmail,
      ownerName: name,
      kind: 'CLIENT',
      status: 'TRIAL',
      phone: phone || null,
    },
  });

  const seat = await assertTechnicianSeatForNewUser(tx, tenant.id, 'USER');
  if (!seat.ok) {
    const err = new Error(seat.error || 'Limite do plano.');
    err.code = seat.code || 'PLAN_MAX_TECHNICIANS';
    throw err;
  }

  const u = await tx.user.create({
    data: {
      name,
      email: emailNorm,
      password: passwordHash,
      tenantId: tenant.id,
      phone,
      role: 'USER',
      phoneVerifiedAt,
      ...(appAccountId ? { appAccountId } : {}),
    },
  });

  await tx.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: u.id,
      action: auditAction,
      resource: auditResource,
      category: 'AUTH',
    },
  });

  const user = await tx.user.findUnique({
    where: { id: u.id },
    include: { tenant: { include: { subscription: { include: { plan: true } } } }, technicianProfile: true },
  });
  if (!user) {
    throw new Error('Falha ao recarregar utilizador após registo.');
  }
  return { tenant, user };
}

/**
 * Cria tenant `CLIENT` (espaço pessoal) e o primeiro utilizador `USER` com a palavra-passe indicada.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   name: string,
 *   emailNorm: string,
 *   passwordHash: string,
 *   phone?: string|null,
 *   phoneVerifiedAt?: Date|null,
 *   auditAction: string,
 *   auditResource?: string|null,
 *   appAccountId?: string|null,
 * }} opts
 * @returns {Promise<{ tenant: import('@prisma/client').Tenant; user: import('@prisma/client').User & { tenant: any } }>}
 */
async function createPersonalClientTenantAndUser(prisma, opts) {
  return prisma.$transaction((tx) => createPersonalClientTenantAndUserInTransaction(tx, opts));
}

module.exports = {
  createPersonalClientTenantAndUser,
  createPersonalClientTenantAndUserInTransaction,
  syntheticTenantOwnerEmailForClientSpace,
};
