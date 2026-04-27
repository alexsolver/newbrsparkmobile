'use strict';

/**
 * Incluições Prisma para estado de onboarding + afiliações (app e painel).
 */
const onboardingStatusInclude = {
  applications: {
    orderBy: { updatedAt: 'desc' },
    take: 1,
  },
  affiliations: {
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      tenant: {
        select: { id: true, name: true, slug: true, status: true, kind: true, email: true },
      },
    },
  },
};

function normalizeEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

/**
 * Resolve `ProviderIdentity` e **todas** as afiliações visíveis para o utilizador, fundindo várias
 * PIs do mesmo `AppAccount` (convites podem estar noutra linha `User` que a ficha editada).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {string} [jwtEmailNorm]
 */
async function resolveMergedProviderIdentityForUserId(prisma, userId, jwtEmailNorm = '') {
  const sessionUser = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { appAccountId: true, email: true },
  });
  let appAccountId = sessionUser?.appAccountId || null;
  if (!appAccountId && jwtEmailNorm) {
    const acc = await prisma.appAccount.findUnique({
      where: { emailNorm: String(jwtEmailNorm).trim().toLowerCase() },
      select: { id: true },
    });
    if (acc) appAccountId = acc.id;
  }
  if (!appAccountId && sessionUser?.email) {
    const acc = await prisma.appAccount.findUnique({
      where: { emailNorm: normalizeEmail(sessionUser.email) },
      select: { id: true },
    });
    if (acc) appAccountId = acc.id;
  }

  if (appAccountId) {
    const identities = await prisma.providerIdentity.findMany({
      where: { user: { appAccountId: String(appAccountId) } },
      include: onboardingStatusInclude,
      orderBy: { updatedAt: 'desc' },
    });
    if (!identities.length) {
      return prisma.providerIdentity.findUnique({
        where: { userId: String(userId) },
        include: onboardingStatusInclude,
      });
    }
    const mergedAffById = new Map();
    for (const pi of identities) {
      for (const aff of pi.affiliations || []) {
        if (!mergedAffById.has(aff.id)) mergedAffById.set(aff.id, aff);
      }
    }
    const mergedAffiliations = Array.from(mergedAffById.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    if (identities.length === 1) return identities[0];

    const pickBase =
      [...identities].sort((a, b) => {
        const c = (b.affiliations?.length || 0) - (a.affiliations?.length || 0);
        if (c !== 0) return c;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })[0] || identities[0];
    const appsSource =
      identities.find((pi) => (pi.applications && pi.applications.length > 0)) || pickBase;
    return {
      ...pickBase,
      affiliations: mergedAffiliations,
      applications: appsSource.applications || [],
    };
  }

  return prisma.providerIdentity.findUnique({
    where: { userId: String(userId) },
    include: onboardingStatusInclude,
  });
}

module.exports = {
  onboardingStatusInclude,
  resolveMergedProviderIdentityForUserId,
  normalizeEmail,
};
