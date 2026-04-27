'use strict';

/**
 * App móvel: com afiliação DEDICATED + ACTIVE, o contexto operacional é a tenant empresa
 * (branding, OS, etc.), mesmo que o `User` «casa» seja a org prestador. Sem dedicado, usa-se `User.tenantId`.
 *
 * Importante: o mesmo e-mail (`AppAccount`) pode ter **várias** `ProviderIdentity` (vários `User`).
 * O dedicado ativo pode estar noutra PI; por isso, com `appAccountId`, procuramos a afiliação em **todas**
 * as identidades do grupo. Sem `appAccountId`, mantém-se só a PI do `userId`.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function resolveAppEffectiveTenantId(prisma, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const row = await prisma.user.findUnique({
    where: { id: uid },
    select: { tenantId: true, appAccountId: true },
  });
  if (!row?.tenantId) return null;
  const homeTid = String(row.tenantId);
  const appAccountId = row.appAccountId ? String(row.appAccountId) : null;

  const whereDedicated = {
    status: 'ACTIVE',
    relationshipType: 'DEDICATED',
    ...(appAccountId
      ? { providerIdentity: { user: { appAccountId } } }
      : { providerIdentity: { userId: uid } }),
  };

  const aff = await prisma.providerTenantAffiliation.findFirst({
    where: whereDedicated,
    orderBy: { updatedAt: 'desc' },
    select: { tenantId: true },
  });
  const dedicatedTid = aff?.tenantId ? String(aff.tenantId).trim() : '';
  if (!dedicatedTid) return homeTid;
  if (dedicatedTid === homeTid) return homeTid;

  const tenant = await prisma.tenant.findUnique({
    where: { id: dedicatedTid },
    select: { id: true, kind: true, status: true },
  });
  if (!tenant) return homeTid;
  const st = String(tenant.status || '').toUpperCase();
  if (st === 'SUSPENDED' || st === 'CANCELLED') return homeTid;
  const k = String(tenant.kind || 'COMPANY').toUpperCase();
  if (k !== 'COMPANY') return homeTid;
  return dedicatedTid;
}

async function loadTenantForAppJwtPayload(prisma, tenantId) {
  return prisma.tenant.findUnique({
    where: { id: String(tenantId) },
    include: { subscription: { include: { plan: true } } },
  });
}

/**
 * Utilizador com `tenant` / `tenantId` alinhados ao contexto app (dedicado ou casa).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} freshUser — resultado `findUnique` com `tenant` incluído
 */
async function buildPresentationUserForApp(prisma, freshUser) {
  if (!freshUser?.id) return freshUser;
  const effTid = await resolveAppEffectiveTenantId(prisma, freshUser.id);
  if (!effTid || effTid === freshUser.tenantId) return freshUser;
  const effTenant = await loadTenantForAppJwtPayload(prisma, effTid);
  if (!effTenant) return freshUser;
  return { ...freshUser, tenantId: effTid, tenant: effTenant };
}

/**
 * Garante que a tenant efetiva (dedicada ou casa) não está suspensa/cancelada.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string; tenant?: { id?: string; status?: string|null }|null }} user
 * @returns {Promise<{ ok: true, effectiveTenantId: string } | { ok: false, error: string }>}
 */
async function assertAppLoginAllowedForEffectiveTenant(prisma, user) {
  if (!user?.id) return { ok: false, error: 'Conta inválida.' };
  const effId = await resolveAppEffectiveTenantId(prisma, user.id);
  let status = user.tenant && String(user.tenant.id) === effId ? String(user.tenant.status || '') : '';
  if (!status) {
    const t = await prisma.tenant.findUnique({
      where: { id: effId },
      select: { status: true },
    });
    status = String(t?.status || '');
  }
  if (!status) return { ok: false, error: 'Conta inválida.' };
  const u = status.toUpperCase();
  if (u === 'SUSPENDED' || u === 'CANCELLED') {
    return { ok: false, error: 'Conta suspensa ou cancelada.' };
  }
  return { ok: true, effectiveTenantId: effId };
}

module.exports = {
  resolveAppEffectiveTenantId,
  loadTenantForAppJwtPayload,
  buildPresentationUserForApp,
  assertAppLoginAllowedForEffectiveTenant,
};
