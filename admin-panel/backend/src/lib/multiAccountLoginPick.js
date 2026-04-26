'use strict';

/**
 * Prioridade do tipo de tenant para o login por defeito (app móvel / mesmo e-mail):
 * prestador (PROVIDER) > empresa (COMPANY) > cliente (CLIENT).
 * Empate no mesmo tipo: organização com mais membros; novo empate: `createdAt` mais antigo.
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
 * Quando o mesmo e-mail existe em vários tenants, escolhe a filiação com tenant de maior prioridade
 * (PROVIDER > COMPANY > CLIENT); empates: mais membros na organização, depois utilizador mais antigo.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<{ tenantId: string; createdAt: Date | string; tenant?: { kind?: string|null } }>} candidates
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

module.exports = { selectUserForMultiAccountLogin, tenantKindPriorityForDefaultLogin };
