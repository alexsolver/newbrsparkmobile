'use strict';

/**
 * Quando o mesmo e-mail existe em vários tenants, escolhe o utilizador cuja organização tem mais membros.
 * Empate: utilizador com `createdAt` mais antigo entre os empatados.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<{ tenantId: string; createdAt: Date | string }>} candidates
 * @returns {Promise<import('@prisma/client').User | null>}
 */
async function selectUserForMultiAccountLogin(prisma, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

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

  let maxN = -1;
  for (const tid of tenantIds) {
    const n = countByTenant[tid] || 0;
    if (n > maxN) maxN = n;
  }

  const topTenants = tenantIds.filter((tid) => (countByTenant[tid] || 0) === maxN);
  const pool = candidates.filter((u) => topTenants.includes(String(u.tenantId)));
  pool.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return pool[0] || null;
}

module.exports = { selectUserForMultiAccountLogin };
