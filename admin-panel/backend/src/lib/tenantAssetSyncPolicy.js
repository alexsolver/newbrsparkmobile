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
 * Cláusula Prisma para listar ativos visíveis na sync do app.
 * @param {{ tenantKind: string, tenantId: string, userId: string, userEmail: string, sharedAssetIds: string[] }} ctx
 */
function buildAssetVisibilityWhere(ctx) {
  const tenantId = String(ctx.tenantId || '').trim();
  const userId = String(ctx.userId || '').trim();
  const email = String(ctx.userEmail || '').trim().toLowerCase();
  const sharedIds = Array.isArray(ctx.sharedAssetIds) ? [...new Set(ctx.sharedAssetIds.filter(Boolean))] : [];
  const kind = String(ctx.tenantKind || 'COMPANY').toUpperCase();

  const notDeleted = { deletedAt: null };

  const sharedBranch =
    sharedIds.length > 0
      ? { id: { in: sharedIds }, ...notDeleted }
      : null;

  // Prestador: só inventário recebido por partilha (não lista bens da tenant «própria»).
  if (kind === 'PROVIDER') {
    if (sharedBranch) return sharedBranch;
    return { id: { in: [] } };
  }

  if (kind === 'CLIENT') {
    const ownInClientTenant = {
      tenantId,
      ...notDeleted,
      OR: [{ createdByUserId: userId }, { createdByUserId: null }],
    };
    if (!sharedBranch) return ownInClientTenant;
    return { OR: [ownInClientTenant, sharedBranch] };
  }

  // COMPANY — inventário partilhado na organização
  const companyOwn = { tenantId, ...notDeleted };
  if (!sharedBranch) return companyOwn;
  return { OR: [companyOwn, sharedBranch] };
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

  if (sameTenant && kind === 'COMPANY') return;

  if (!sameTenant) {
    const sh = await prisma.assetShare.findFirst({
      where: {
        assetId: asset.id,
        sharedWithEmail: em,
        status: 'ACCEPTED',
        permission: 'WRITE',
      },
    });
    if (!sh) {
      const err = new Error('Sem permissão para alterar este ativo (partilha com escrita necessária).');
      err.code = 'ASSET_FORBIDDEN';
      throw err;
    }
    return;
  }

  // sameTenant && (CLIENT | PROVIDER | rare COMPANY edge)
  if (kind === 'COMPANY') return;

  if (kind === 'PROVIDER') {
    const sh = await prisma.assetShare.findFirst({
      where: {
        assetId: asset.id,
        sharedWithEmail: em,
        status: 'ACCEPTED',
        permission: 'WRITE',
      },
    });
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

  // CLIENT
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
  buildAssetVisibilityWhere,
  assertUserCanMutateAsset,
  assertProviderTenantAllowsCreate,
};
