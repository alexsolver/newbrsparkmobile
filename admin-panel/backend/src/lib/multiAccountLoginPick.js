'use strict';

/**
 * Prioridade do tipo de tenant para o login por defeito (app móvel / mesmo e-mail),
 * quando **não** há filiação dedicada ativa que fixe outra tenant:
 * prestador (PROVIDER) > empresa (COMPANY) > cliente (CLIENT).
 *
 * @param {string|null|undefined} kind
 * @returns {number}
 */
function tenantKindPriorityForDefaultLogin(kind) {
  const k = String(kind || '').toUpperCase();
  if (k === 'PROVIDER') return 3;
  if (k === 'COMPANY') return 2;
  if (k === 'CLIENT') return 1;
  return 0;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<{ tenantId: string; createdAt: Date | string; tenant?: { kind?: string|null } }>} candidates
 */
async function pickAmongWithMemberCounts(prisma, candidates) {
  const tenantIds = [...new Set(candidates.map((u) => String(u.tenantId)))];
  const grouped = await prisma.user.groupBy({
    by: ['tenantId'],
    where: { tenantId: { in: tenantIds } },
    _count: { id: true },
  });
  /** @type {Record<string, number>} */
  const countByTenant = {};
  for (const g of grouped) {
    countByTenant[g.tenantId] = g._count.id;
  }

  const scored = candidates.map((u) => {
    const kind = u.tenant && u.tenant.kind != null ? u.tenant.kind : null;
    const prio = tenantKindPriorityForDefaultLogin(kind);
    const n = countByTenant[String(u.tenantId)] || 0;
    const created = new Date(u.createdAt).getTime();
    return { u, prio, n, created };
  });

  scored.sort((a, b) => {
    if (b.prio !== a.prio) return b.prio - a.prio;
    if (b.n !== a.n) return b.n - a.n;
    return a.created - b.created;
  });

  return scored[0]?.u || null;
}

/**
 * Quando o mesmo e-mail existe em vários tenants:
 * 1) Se existir afiliação DEDICATED+ACTIVE, preferir a linha `User` cuja `tenantId` coincide com essa empresa.
 * 2) Caso contrário, preferir tenant PROVIDER (casa do prestador) quando existir.
 * 3) Senão, desempate por tipo (PROVIDER > COMPANY > CLIENT), nº de membros, `createdAt`.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<{ id: string; tenantId: string; createdAt: Date | string; tenant?: { kind?: string|null } }>} candidates
 * @returns {Promise<import('@prisma/client').User | null>}
 */
async function selectUserForMultiAccountLogin(prisma, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const userIds = [...new Set(candidates.map((u) => String(u.id)))];
  const identities = await prisma.providerIdentity.findMany({
    where: { userId: { in: userIds } },
    select: {
      userId: true,
      affiliations: {
        where: { status: 'ACTIVE', relationshipType: 'DEDICATED' },
        take: 1,
        select: { tenantId: true },
      },
    },
  });
  /** @type {Map<string, string>} */
  const dedicatedTenantByUserId = new Map();
  for (const idn of identities) {
    const tid = idn.affiliations[0]?.tenantId;
    if (tid) dedicatedTenantByUserId.set(String(idn.userId), String(tid));
  }

  for (const u of candidates) {
    const d = dedicatedTenantByUserId.get(String(u.id));
    if (d && String(u.tenantId) === d) return u;
  }

  const providerHomes = candidates.filter((u) => String(u.tenant?.kind || '').toUpperCase() === 'PROVIDER');
  if (providerHomes.length === 1) return providerHomes[0];
  if (providerHomes.length > 1) {
    return pickAmongWithMemberCounts(prisma, providerHomes);
  }

  return pickAmongWithMemberCounts(prisma, candidates);
}

module.exports = { selectUserForMultiAccountLogin, tenantKindPriorityForDefaultLogin };
