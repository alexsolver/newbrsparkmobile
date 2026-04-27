'use strict';

/**
 * Prestador já com vínculo DEDICATED + ACTIVE: não faz sentido abrir / submeter
 * candidatura de onboarding global por autoatendimento (duplica fila no painel).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} providerIdentityId
 * @returns {Promise<boolean>}
 */
async function hasActiveDedicatedAffiliation(prisma, providerIdentityId) {
  const pid = String(providerIdentityId || '').trim();
  if (!pid) return false;
  const n = await prisma.providerTenantAffiliation.count({
    where: {
      providerIdentityId: pid,
      relationshipType: 'DEDICATED',
      status: 'ACTIVE',
    },
  });
  return n > 0;
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
  const n = await prisma.providerTenantAffiliation.count({
    where: {
      relationshipType: 'DEDICATED',
      status: 'ACTIVE',
      providerIdentity: { userId: uid },
    },
  });
  return n > 0;
}

module.exports = {
  hasActiveDedicatedAffiliation,
  hasActiveDedicatedAffiliationForAppUser,
};
