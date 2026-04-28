'use strict';

const { normalizeEmail } = require('./fieldTaskExecutionAccess');

/**
 * Prestador (identidade global) tem vínculo DEDICATED+ACTIVE com a empresa que despacha a OS?
 * Sem isso, a OS deve ir em modo oferta (BROADCAST), não atribuição direta.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} prisma
 * @param {string} assigneeEmail
 * @param {string} dispatchTenantId
 * @returns {Promise<boolean>}
 */
async function assigneeHasActiveDedicatedWithTenant(prisma, assigneeEmail, dispatchTenantId) {
  const tid = String(dispatchTenantId || '').trim();
  const em = normalizeEmail(assigneeEmail);
  if (!tid || !em) return false;

  const acc = await prisma.appAccount.findUnique({
    where: { emailNorm: em },
    select: { id: true },
  });
  const users = acc
    ? await prisma.user.findMany({
        where: { appAccountId: String(acc.id), isActive: true },
        select: { id: true },
      })
    : await prisma.user.findMany({
        where: { email: { equals: em, mode: 'insensitive' }, isActive: true },
        select: { id: true },
        take: 8,
      });

  const piIds = new Set();
  for (const u of users) {
    const pi = await prisma.providerIdentity.findUnique({
      where: { userId: u.id },
      select: { id: true },
    });
    if (pi?.id) piIds.add(String(pi.id));
  }
  if (!piIds.size) return false;

  const aff = await prisma.providerTenantAffiliation.findFirst({
    where: {
      providerIdentityId: { in: [...piIds] },
      tenantId: tid,
      status: 'ACTIVE',
      relationshipType: 'DEDICATED',
    },
    select: { id: true },
  });
  return !!aff;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} resolvedEmails — e-mails já validados como prestadores elegíveis
 * @param {string} dispatchTenantId
 * @returns {Promise<boolean>}
 */
async function allAssigneesHaveDedicatedWithTenant(prisma, resolvedEmails, dispatchTenantId) {
  const list = Array.isArray(resolvedEmails) ? resolvedEmails : [];
  if (!list.length) return false;
  for (const mail of list) {
    if (!(await assigneeHasActiveDedicatedWithTenant(prisma, mail, dispatchTenantId))) return false;
  }
  return true;
}

module.exports = {
  assigneeHasActiveDedicatedWithTenant,
  allAssigneesHaveDedicatedWithTenant,
};
