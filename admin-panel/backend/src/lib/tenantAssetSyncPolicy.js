'use strict';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 * @returns {Promise<'COMPANY'|'CLIENT'|'PROVIDER'>}
 */
async function getTenantKind(prisma, tenantId) {
  const t = await prisma.tenant.findUnique({
    where: { id: String(tenantId || '').trim() },
    select: { kind: true },
  });
  return t?.kind && ['COMPANY', 'CLIENT', 'PROVIDER'].includes(t.kind) ? t.kind : 'COMPANY';
}

/**
 * IDs de ativos visíveis na sync: raízes pessoais (ou partilhadas) + descendentes na árvore.
 * Empresas não têm inventário tenant-wide — só o que o utilizador criou ou lhe foi partilhado.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ tenantKind: string, tenantId: string, userId: string, sharedAssetIds: string[] }} ctx
 * @returns {Promise<string[]>}
 */
async function expandVisibleAssetIds(prisma, ctx) {
  const tenantId = String(ctx.tenantId || '').trim();
  const userId = String(ctx.userId || '').trim();
  const sharedIds = [...new Set((ctx.sharedAssetIds || []).filter(Boolean).map(String))];
  const kind = String(ctx.tenantKind || 'COMPANY').toUpperCase();

  /** @type {Set<string>} */
  const roots = new Set(sharedIds);

  if (kind !== 'PROVIDER') {
    const owned = await prisma.asset.findMany({
      where: { tenantId, deletedAt: null, createdByUserId: userId },
      select: { id: true },
    });
    for (const r of owned) roots.add(r.id);
  }

  if (roots.size === 0) return [];

  /** @type {Set<string>} */
  const all = new Set(roots);
  let frontier = [...roots];

  while (frontier.length > 0) {
    const children = await prisma.asset.findMany({
      where: { deletedAt: null, parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = [];
    for (const c of children) {
      if (!all.has(c.id)) {
        all.add(c.id);
        frontier.push(c.id);
      }
    }
  }

  return [...all];
}

/**
 * @deprecated Preferir `expandVisibleAssetIds` — inventário já não é por tenant em COMPANY.
 * Mantido para compatibilidade com testes/scripts que montam where manualmente.
 */
function buildAssetVisibilityWhere(ctx) {
  const tenantId = String(ctx.tenantId || '').trim();
  const userId = String(ctx.userId || '').trim();
  const sharedIds = Array.isArray(ctx.sharedAssetIds) ? [...new Set(ctx.sharedAssetIds.filter(Boolean))] : [];
  const kind = String(ctx.tenantKind || 'COMPANY').toUpperCase();
  const notDeleted = { deletedAt: null };
  const sharedBranch =
    sharedIds.length > 0 ? { id: { in: sharedIds }, ...notDeleted } : null;

  if (kind === 'PROVIDER') {
    if (sharedBranch) return sharedBranch;
    return { id: { in: [] } };
  }

  const ownPersonal = { tenantId, deletedAt: null, createdByUserId: userId };
  if (!sharedBranch) return ownPersonal;
  return { OR: [ownPersonal, sharedBranch] };
}

async function findAcceptedWriteShare(prisma, assetId, emailNorm) {
  return prisma.assetShare.findFirst({
    where: {
      assetId,
      sharedWithEmail: emailNorm,
      status: 'ACCEPTED',
      permission: 'WRITE',
    },
  });
}

/**
 * Verifica se o utilizador pode alterar/apagar um ativo existente.
 */
async function assertUserCanMutateAsset(prisma, { tenantId, userId, userEmail, tenantKind, asset }) {
  if (!asset) {
    const err = new Error('Ativo não encontrado.');
    err.code = 'ASSET_NOT_FOUND';
    throw err;
  }
  const kind = String(tenantKind || 'COMPANY').toUpperCase();
  const uid = String(userId || '').trim();
  const em = String(userEmail || '').trim().toLowerCase();
  const sameTenant = String(asset.tenantId) === String(tenantId);

  if (!sameTenant) {
    const sh = await findAcceptedWriteShare(prisma, asset.id, em);
    if (!sh) {
      const err = new Error('Sem permissão para alterar este ativo (partilha com escrita necessária).');
      err.code = 'ASSET_FORBIDDEN';
      throw err;
    }
    return;
  }

  // Mesmo tenant
  if (kind === 'PROVIDER') {
    const sh = await findAcceptedWriteShare(prisma, asset.id, em);
    if (sh) return;
    const creator = asset.createdByUserId != null ? String(asset.createdByUserId) : null;
    if (creator && creator !== uid) {
      const err = new Error('Sem permissão para alterar este ativo.');
      err.code = 'ASSET_FORBIDDEN';
      throw err;
    }
    if (!creator) {
      const n = await prisma.user.count({ where: { tenantId } });
      if (n > 1) {
        const err = new Error(
          'Este ativo não tem criador associado; só pode ser alterado após migração ou por um único utilizador na organização.',
        );
        err.code = 'ASSET_AMBIGUOUS_OWNER';
        throw err;
      }
    }
    return;
  }

  // COMPANY | CLIENT — ativos são por utilizador; não há inventário org-wide.
  const creator = asset.createdByUserId != null ? String(asset.createdByUserId) : null;
  if (creator && creator !== uid) {
    const sh = await findAcceptedWriteShare(prisma, asset.id, em);
    if (!sh) {
      const err = new Error('Sem permissão para alterar este ativo.');
      err.code = 'ASSET_FORBIDDEN';
      throw err;
    }
    return;
  }
  if (!creator) {
    const n = await prisma.user.count({ where: { tenantId } });
    if (n > 1) {
      const err = new Error(
        'Este ativo não tem criador associado; só pode ser alterado após migração ou por um único utilizador na organização.',
      );
      err.code = 'ASSET_AMBIGUOUS_OWNER';
      throw err;
    }
  }
}

/**
 * Leitura de recursos pessoais (ex.: feed iCal): dono ou partilha aceite.
 */
async function assertUserCanAccessOwnedOrSharedAsset(prisma, { userId, userEmail, asset }) {
  if (!asset || asset.deletedAt != null) {
    const err = new Error('Ativo não encontrado.');
    err.code = 'ASSET_NOT_FOUND';
    throw err;
  }
  const uid = String(userId || '').trim();
  const em = String(userEmail || '').trim().toLowerCase();
  const creator = asset.createdByUserId != null ? String(asset.createdByUserId) : null;
  if (creator && creator === uid) return;
  const sh = await prisma.assetShare.findFirst({
    where: {
      assetId: asset.id,
      sharedWithEmail: em,
      status: 'ACCEPTED',
    },
  });
  if (sh) return;
  if (!creator) {
    const n = await prisma.user.count({ where: { tenantId: asset.tenantId } });
    if (n <= 1) return;
  }
  const err = new Error('Sem permissão para aceder a este ativo.');
  err.code = 'ASSET_FORBIDDEN';
  throw err;
}

/**
 * Prestador em tenant PROVIDER: não criar bens locais pela sync (só recebe por partilha).
 */
function assertProviderTenantAllowsCreate(tenantKind) {
  const kind = String(tenantKind || 'COMPANY').toUpperCase();
  if (kind === 'PROVIDER') {
    const err = new Error(
      'Neste espaço prestador não é possível criar ativos locais; utilize a conta cliente ou receba uma partilha.',
    );
    err.code = 'PROVIDER_ASSET_CREATE_FORBIDDEN';
    throw err;
  }
}

module.exports = {
  getTenantKind,
  expandVisibleAssetIds,
  buildAssetVisibilityWhere,
  assertUserCanMutateAsset,
  assertUserCanAccessOwnedOrSharedAsset,
  assertProviderTenantAllowsCreate,
};
