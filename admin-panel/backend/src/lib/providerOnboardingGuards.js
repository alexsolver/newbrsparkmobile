'use strict';

const { tenantIsSharedAppRegistrationPool } = require('./resolveSharedRegistrationTenant');

/**
 * Prestador já com vínculo DEDICATED + ACTIVE com **empresa operacional** (exclui a tenant
 * COMPANY de registo partilhado da app — piscina `master`): não faz sentido abrir / submeter
 * candidatura de onboarding global por autoatendimento (duplica fila no painel).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} providerIdentityId
 * @returns {Promise<boolean>}
 */
async function hasActiveDedicatedAffiliation(prisma, providerIdentityId) {
  const pid = String(providerIdentityId || '').trim();
  if (!pid) return false;
  const rows = await prisma.providerTenantAffiliation.findMany({
    where: {
      providerIdentityId: pid,
      relationshipType: 'DEDICATED',
      status: 'ACTIVE',
    },
    select: { tenantId: true },
  });
  for (const r of rows) {
    if (!(await tenantIsSharedAppRegistrationPool(prisma, r.tenantId))) return true;
  }
  return false;
}

/**
 * Mesma regra, por `User.id` (rotas que ainda não carregaram `ProviderIdentity`).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
async function hasActiveDedicatedAffiliationForAppUser(prisma, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  const rows = await prisma.providerTenantAffiliation.findMany({
    where: {
      relationshipType: 'DEDICATED',
      status: 'ACTIVE',
      providerIdentity: { userId: uid },
    },
    select: { tenantId: true },
  });
  for (const r of rows) {
    if (!(await tenantIsSharedAppRegistrationPool(prisma, r.tenantId))) return true;
  }
  return false;
}

module.exports = {
  hasActiveDedicatedAffiliation,
  hasActiveDedicatedAffiliationForAppUser,
};
