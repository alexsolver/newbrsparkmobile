'use strict';

/**
 * Chave em `ChecklistExecution.metadata` gravada no despacho quando o template não tem `tenantId`
 * (formulário «global») — permite à API móvel filtrar por org sem fuga de dados homónimos, desde que
 * o valor venha do utilizador atribuído (ou do próprio template quando preenchido).
 */
const FIELD_TASK_CONTEXT_TENANT_KEY = 'fieldTaskContextTenantId';

const FIELD_ROLES = ['PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'];

/**
 * Filtro Prisma: a execução FT pertence ao tenant (template, ativo, ou metadado de despacho).
 * @param {string} tenantId
 * @param {string[]} tenantAssetIds
 * @returns {{ OR: import('@prisma/client').Prisma.ChecklistExecutionWhereInput[] }}
 */
function prismaWhereExecutionBelongsToTenant(tenantId, tenantAssetIds) {
  const tid = String(tenantId || '').trim();
  if (!tid) {
    return { OR: [] };
  }
  const or = [
    { template: { tenantId: tid } },
    { metadata: { path: [FIELD_TASK_CONTEXT_TENANT_KEY], equals: tid } },
  ];
  if (Array.isArray(tenantAssetIds) && tenantAssetIds.length) {
    or.push({ assetId: { in: tenantAssetIds } });
  }
  return { OR: or };
}

/**
 * Resolve a tenant a gravar em metadata no despacho.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   loadedTemplate: import('@prisma/client').ChecklistTemplate | null,
 *   resolvedList: string[],
 *   scopedTenantId: string | null,
 * }} opts
 * @returns {Promise<string | null>}
 */
async function resolveFieldTaskContextTenantIdForDispatch(prisma, { loadedTemplate, resolvedList, scopedTenantId }) {
  if (loadedTemplate && loadedTemplate.tenantId) {
    return String(loadedTemplate.tenantId);
  }
  if (scopedTenantId) {
    return String(scopedTenantId);
  }
  if (!Array.isArray(resolvedList) || !resolvedList.length) {
    return null;
  }
  const emails = [...new Set(resolvedList.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) return null;

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: FIELD_ROLES },
      OR: emails.map((em) => ({ email: { equals: em, mode: 'insensitive' } })),
    },
    select: { tenantId: true, email: true },
  });
  const tids = [...new Set(users.map((u) => u.tenantId).filter(Boolean))];
  if (tids.length === 1) {
    return String(tids[0]);
  }
  if (tids.length > 1) {
    console.warn(
      '[fieldTaskContextTenant] Vários tenants para candidatos; uso preferencial por primeiro e-mail resolvido.',
      tids
    );
    const first = String(resolvedList[0] || '').trim();
    const u0 = await prisma.user.findFirst({
      where: {
        isActive: true,
        email: { equals: first, mode: 'insensitive' },
        role: { in: FIELD_ROLES },
      },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true },
    });
    if (u0 && u0.tenantId) return String(u0.tenantId);
  }
  if (tids[0]) return String(tids[0]);
  return null;
}

module.exports = {
  FIELD_TASK_CONTEXT_TENANT_KEY,
  prismaWhereExecutionBelongsToTenant,
  resolveFieldTaskContextTenantIdForDispatch,
};
