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
      /** Por linha: o painel não pode usar só o KYC da PI «base» fundida (cada vínculo tem o seu providerIdentityId). */
      providerIdentity: { select: { id: true, kycStatus: true } },
    },
  },
};

function normalizeEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

const up = (s) => String(s || '').toUpperCase().trim();

/** Menor = estado «mais restritivo» para o mesmo tenant (ex.: INACTIVE prevalece sobre ACTIVE). */
function affiliationStatusRank(st) {
  const u = String(st || '').toUpperCase();
  if (u === 'REJECTED') return 0;
  if (u === 'INACTIVE') return 1;
  if (u === 'SUSPENDED') return 2;
  if (u === 'REQUESTED') return 3;
  if (u === 'INVITED') return 4;
  if (u === 'ACTIVE') return 5;
  return 99;
}

function affiliationRelationshipRank(rt) {
  const u = String(rt || '').toUpperCase();
  if (u === 'DEDICATED' || u === 'PARTNER') return 0;
  if (u === 'OWNER') return 2;
  return 1;
}

/**
 * Mesmo `tenantId` pode aparecer em mais do que uma `ProviderTenantAffiliation` (vários User/PI
 * no mesmo AppAccount). Para leitura fundida, uma linha canónica por tenant — o estado mais
 * restritivo — alinha app e painel.
 *
 * @param {unknown[]} affiliations
 */
function dedupeAffiliationsByTenantId(affiliations) {
  if (!Array.isArray(affiliations) || affiliations.length <= 1) return affiliations || [];
  const byTenant = new Map();
  const withoutTenant = [];
  for (const aff of affiliations) {
    const tid = String(aff.tenantId || aff.tenant?.id || '').trim();
    if (!tid) {
      withoutTenant.push(aff);
      continue;
    }
    if (!byTenant.has(tid)) byTenant.set(tid, []);
    byTenant.get(tid).push(aff);
  }
  const out = [...withoutTenant];
  for (const group of byTenant.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const pick = [...group].sort((a, b) => {
      const sr = affiliationStatusRank(a.status) - affiliationStatusRank(b.status);
      if (sr !== 0) return sr;
      const rr = affiliationRelationshipRank(a.relationshipType) - affiliationRelationshipRank(b.relationshipType);
      if (rr !== 0) return rr;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })[0];
    out.push(pick);
  }
  return out.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Várias `ProviderIdentity` no mesmo `AppAccount`: a «base» escolhida por mais afiliações
 * pode ter KYC ainda PENDING enquanto outra linha (ex.: a que o admin aprovou) está APPROVED.
 * Para a app e o painel, o KYC do utilizador segue a melhor situação entre todas.
 */
function pickMergedKycAndGlobalStatus(identities) {
  if (!identities || !identities.length) return {};
  if (identities.some((i) => up(i.kycStatus) === 'APPROVED')) {
    const row = identities.find((i) => up(i.kycStatus) === 'APPROVED');
    return { kycStatus: 'APPROVED', globalStatus: row?.globalStatus || 'VERIFIED' };
  }
  if (identities.every((i) => up(i.kycStatus) === 'REJECTED')) {
    return { kycStatus: 'REJECTED', globalStatus: identities[0].globalStatus };
  }
  const sorted = [...identities].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return { kycStatus: sorted[0].kycStatus, globalStatus: sorted[0].globalStatus };
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
    const mergedAffiliations = dedupeAffiliationsByTenantId(
      Array.from(mergedAffById.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
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
    const kycLayer = pickMergedKycAndGlobalStatus(identities);
    return {
      ...pickBase,
      ...kycLayer,
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
  dedupeAffiliationsByTenantId,
};
