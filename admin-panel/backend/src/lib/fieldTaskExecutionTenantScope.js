'use strict';

/** Igual a `fieldTaskExecutionAccess.normalizeEmail` — não importar daí (dependência circular). */
function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

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
 * App móvel: FT/OS despachadas com `fieldTaskContextTenantId` = org de registo do técnico
 * devem continuar visíveis quando a sessão opera noutro tenant (ex.: espaço PROVIDER pessoal).
 * Combina o tenant efetivo do JWT, a tenant da linha `User` e **todas** as tenants de outros `User`
 * do mesmo `AppAccount` (mesmo login — e-mail sintético vs org de registo).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ effectiveTenantId: string, userId: string }} opts
 * @returns {Promise<import('@prisma/client').Prisma.ChecklistExecutionWhereInput>}
 */
async function prismaWhereExecutionBelongsToAppFieldTaskScope(prisma, { effectiveTenantId, userId }) {
  const eff = String(effectiveTenantId || '').trim();
  const uid = String(userId || '').trim();
  if (!uid) return { OR: [] };
  const homeRow = await prisma.user.findUnique({
    where: { id: uid },
    select: { tenantId: true, appAccountId: true },
  });
  const scopeIdSet = new Set([eff, String(homeRow?.tenantId || '').trim()].filter(Boolean));
  /** Utilizadores do mesmo login (`AppAccount`) — FT pode estar na org de outra filiação. */
  const userIdsForAffiliations = new Set([uid]);
  if (homeRow?.appAccountId) {
    const sibs = await prisma.user.findMany({
      where: { appAccountId: String(homeRow.appAccountId), isActive: true },
      select: { id: true, tenantId: true },
    });
    for (const s of sibs) {
      const t = String(s.tenantId || '').trim();
      if (t) scopeIdSet.add(t);
      if (s.id) userIdsForAffiliations.add(String(s.id));
    }
  }
  /**
   * Tenants de empresas com vínculo prestador (ACTIVE / convite em curso): o despacho usa
   * `template.tenantId` ou `metadata.fieldTaskContextTenantId` da **empresa**, que muitas vezes
   * não coincide com `User.tenantId` da linha com que o técnico fez login — sem isto `/api/sync/tasks` vinha [].
   */
  try {
    const identities = await prisma.providerIdentity.findMany({
      where: { userId: { in: [...userIdsForAffiliations] } },
      select: { id: true },
    });
    const piIds = identities.map((p) => p.id).filter(Boolean);
    if (piIds.length) {
      const affs = await prisma.providerTenantAffiliation.findMany({
        where: {
          providerIdentityId: { in: piIds },
          status: { in: ['ACTIVE', 'INVITED', 'REQUESTED'] },
        },
        select: { tenantId: true },
      });
      for (const a of affs) {
        const t = String(a.tenantId || '').trim();
        if (t) scopeIdSet.add(t);
      }
    }
  } catch {
    /* não bloquear sync se o schema/BD divergir */
  }
  const scopeIds = [...scopeIdSet];
  if (!scopeIds.length) return { OR: [] };

  const assetRows = await prisma.asset.findMany({
    where: { tenantId: { in: scopeIds } },
    select: { id: true, tenantId: true },
  });
  const assetIdsByTenant = new Map(scopeIds.map((id) => [id, []]));
  for (const row of assetRows) {
    const list = assetIdsByTenant.get(row.tenantId);
    if (list) list.push(row.id);
  }

  const parts = [];
  for (const tid of scopeIds) {
    const inner = prismaWhereExecutionBelongsToTenant(tid, assetIdsByTenant.get(tid) || []);
    if (inner.OR && inner.OR.length) parts.push(...inner.OR);
  }
  return { OR: parts };
}

/**
 * Utilizadores PROVIDER ativos para e-mails de despacho (canónico de login ou `User.email`).
 * Alinha-se a `resolveFieldTaskAssigneeEmail`: prestadores na pool usam e-mail sintético na linha `User`.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string[]} rawEmails
 */
async function usersForFieldTaskContextByDispatchEmails(prisma, rawEmails) {
  const list = [...new Set((rawEmails || []).map((e) => String(e || '').trim()).filter(Boolean))];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const em = normEmail(raw);
    if (!em) continue;
    const acc = await prisma.appAccount.findUnique({
      where: { emailNorm: em },
      select: { id: true },
    });
    const where = {
      isActive: true,
      role: 'PROVIDER',
      ...(acc?.id ? { appAccountId: String(acc.id) } : { email: { equals: raw, mode: 'insensitive' } }),
    };
    const rows = await prisma.user.findMany({
      where,
      select: { id: true, tenantId: true, email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 24,
    });
    for (const r of rows) {
      if (r.id && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
      }
    }
  }
  return out;
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
  const emails = [...new Set(resolvedList.map((e) => String(e || '').trim()).filter(Boolean))];
  if (!emails.length) return null;

  const users = await usersForFieldTaskContextByDispatchEmails(prisma, emails);
  const tids = [...new Set(users.map((u) => String(u.tenantId || '').trim()).filter(Boolean))];
  if (tids.length === 1) {
    return String(tids[0]);
  }
  if (tids.length > 1) {
    console.warn(
      '[fieldTaskContextTenant] Vários tenants para candidatos; uso preferencial por primeiro e-mail resolvido.',
      tids
    );
    const firstBatch = await usersForFieldTaskContextByDispatchEmails(prisma, [String(resolvedList[0] || '').trim()]);
    const u0 = firstBatch[0];
    if (u0?.tenantId) return String(u0.tenantId);
  }
  if (tids[0]) return String(tids[0]);
  return null;
}

module.exports = {
  FIELD_TASK_CONTEXT_TENANT_KEY,
  prismaWhereExecutionBelongsToTenant,
  prismaWhereExecutionBelongsToAppFieldTaskScope,
  resolveFieldTaskContextTenantIdForDispatch,
};
