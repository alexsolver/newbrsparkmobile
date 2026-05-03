'use strict';

/**
 * Cache curto: `resolveAppEffectiveTenantId` corre no middleware `authUser` **em cada** pedido à API
 * (lista OS, sync, etc.). Sem cache, são 2–3 round-trips PostgreSQL por pedido — multiplica latência.
 * TTL curto: mudança de dedicado passa a refletir em poucos segundos sem invalidação explícita.
 */
const EFFECTIVE_TENANT_CACHE_MS = Math.max(
  0,
  Math.min(120_000, Number(process.env.APP_EFFECTIVE_TENANT_CACHE_MS || 6000) || 6000),
);
/** @type {Map<string, { exp: number, value: string }>} */
const effectiveTenantCache = new Map();

function effectiveTenantCacheGet(userId) {
  if (EFFECTIVE_TENANT_CACHE_MS <= 0) return null;
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const row = effectiveTenantCache.get(uid);
  if (!row || Date.now() >= row.exp) {
    if (row) effectiveTenantCache.delete(uid);
    return null;
  }
  return row.value;
}

function effectiveTenantCacheSet(userId, value) {
  if (EFFECTIVE_TENANT_CACHE_MS <= 0) return;
  const uid = String(userId || '').trim();
  if (!uid) return;
  effectiveTenantCache.set(uid, { exp: Date.now() + EFFECTIVE_TENANT_CACHE_MS, value: String(value) });
}

/** Chamadas de escrita em afiliações (opcional): limpar cache deste utilizador. */
function invalidateAppEffectiveTenantIdCache(userId) {
  const uid = String(userId || '').trim();
  if (uid) effectiveTenantCache.delete(uid);
}

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
  const hit = effectiveTenantCacheGet(uid);
  if (hit != null) return hit;

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
  if (!dedicatedTid) {
    effectiveTenantCacheSet(uid, homeTid);
    return homeTid;
  }
  if (dedicatedTid === homeTid) {
    effectiveTenantCacheSet(uid, homeTid);
    return homeTid;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: dedicatedTid },
    select: { id: true, kind: true, status: true },
  });
  if (!tenant) {
    effectiveTenantCacheSet(uid, homeTid);
    return homeTid;
  }
  const st = String(tenant.status || '').toUpperCase();
  if (st === 'SUSPENDED' || st === 'CANCELLED') {
    effectiveTenantCacheSet(uid, homeTid);
    return homeTid;
  }
  const k = String(tenant.kind || 'COMPANY').toUpperCase();
  if (k !== 'COMPANY') {
    effectiveTenantCacheSet(uid, homeTid);
    return homeTid;
  }
  effectiveTenantCacheSet(uid, dedicatedTid);
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
  const homeTid = String(freshUser.tenantId || '').trim();
  const effTidRaw = await resolveAppEffectiveTenantId(prisma, freshUser.id);
  const effTid = effTidRaw && String(effTidRaw).trim() ? String(effTidRaw).trim() : homeTid;

  if (!effTid || effTid === homeTid) {
    return { ...freshUser, homeTenantId: homeTid };
  }

  const effTenant = await loadTenantForAppJwtPayload(prisma, effTid);
  if (!effTenant) {
    return { ...freshUser, homeTenantId: homeTid };
  }

  return {
    ...freshUser,
    tenantId: effTid,
    tenant: effTenant,
    homeTenantId: homeTid,
    /** Snapshot da tenant de registo (piscina) — branding experiência cliente. */
    _homeTenant: freshUser.tenant,
  };
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

/**
 * Para `identify` (reconhecimento «buscar»): o subject no FaceMatch usa `User.tenantId` (casa),
 * mas o JWT pode ser a tenant operacional. `resolveAppEffectiveTenantId` cobre o caso dedicado;
 * afiliação ACTIVE na mesma tenant cobre vínculos válidos; rotina atribuída (`RoutineTaskAssignment`) ou
 * batida de ponto nessa tenant também contam (prestadores sem linha em `ProviderIdentity`).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {string} operationalTenantId
 * @returns {Promise<boolean>}
 */
async function userMayOperateUnderTenant(prisma, userId, operationalTenantId) {
  const tid = String(operationalTenantId || '').trim();
  const uid = String(userId || '').trim();
  if (!tid || !uid) return false;
  const eff = await resolveAppEffectiveTenantId(prisma, uid);
  if (eff != null && String(eff).trim() === tid) return true;
  const n = await prisma.providerTenantAffiliation.count({
    where: {
      tenantId: tid,
      status: 'ACTIVE',
      providerIdentity: { userId: uid },
    },
  });
  if (n > 0) return true;
  const rta = await prisma.routineTaskAssignment.count({
    where: { tenantId: tid, userId: uid },
  });
  if (rta > 0) return true;
  const anyPunch = await prisma.workTimePunch.findFirst({
    where: { tenantId: tid, userId: uid },
    select: { id: true },
  });
  return !!anyPunch;
}

module.exports = {
  resolveAppEffectiveTenantId,
  invalidateAppEffectiveTenantIdCache,
  loadTenantForAppJwtPayload,
  buildPresentationUserForApp,
  assertAppLoginAllowedForEffectiveTenant,
  userMayOperateUnderTenant,
};
