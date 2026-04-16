'use strict';

const { saoPauloYearMonthFromDate } = require('./ftOsNumber');

/**
 * Limite mensal efetivo (menor entre plano e teto opcional no tenant).
 * `Tenant.features.googleMaps.monthlyRouteRequestsMax` (número ≥ 0) aperta o teto; 0 desativa para esse tenant.
 * Plano: `Plan.quotaGoogleMapsRoutesPerMonth` — -1 ilimitado; 0 desativa para todos do plano.
 *
 * @param {number} planLimit
 * @param {number|null|undefined} tenantCap
 * @returns {number} -1 = sem limite; 0 = desativado; >0 = máximo de pedidos no mês
 */
function pickEffectiveMonthlyLimit(planLimit, tenantCap) {
  const p = Number.isFinite(Number(planLimit)) ? Math.floor(Number(planLimit)) : -1;
  const tRaw = tenantCap;
  const t =
    tRaw != null && String(tRaw).trim() !== '' && Number.isFinite(Number(tRaw))
      ? Math.floor(Number(tRaw))
      : null;
  if (p === 0 || t === 0) return 0;
  if (t != null && t > 0 && p > 0) return Math.min(p, t);
  if (t != null && t > 0 && p === -1) return t;
  if ((t == null || t < 0) && p >= 0) return p;
  return -1;
}

async function loadPlanLimitForTenant(prisma, tenantId) {
  if (!tenantId) return -1;
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!sub?.plan) return -1;
  const st = String(sub.status || '').toUpperCase();
  if (st === 'CANCELLED') return 0;
  const v = sub.plan.quotaGoogleMapsRoutesPerMonth;
  return Number.isFinite(Number(v)) ? Math.floor(Number(v)) : -1;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 * @returns {Promise<number>}
 */
async function resolveEffectiveGoogleMapsMonthlyLimit(prisma, tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { features: true },
  });
  const feat = tenant?.features && typeof tenant.features === 'object' ? tenant.features : {};
  const gm = feat.googleMaps && typeof feat.googleMaps === 'object' ? feat.googleMaps : {};
  const tenantCap = gm.monthlyRouteRequestsMax;
  const planLimit = await loadPlanLimitForTenant(prisma, tenantId);
  return pickEffectiveMonthlyLimit(planLimit, tenantCap);
}

/**
 * Estado da cota no mês civil (America/Sao_Paulo), sem consumir.
 * @returns {Promise<{ periodKey: string; limit: number; used: number }>}
 */
async function getGoogleMapsRouteUsageState(prisma, tenantId) {
  const limit = await resolveEffectiveGoogleMapsMonthlyLimit(prisma, tenantId);
  const { periodKey } = saoPauloYearMonthFromDate(new Date());
  const row = await prisma.tenantPlanUsagePeriod.findUnique({
    where: { tenantId_periodKey: { tenantId, periodKey } },
    select: { googleMapsRouteCount: true },
  });
  const used = row ? Number(row.googleMapsRouteCount) || 0 : 0;
  return { periodKey, limit, used };
}

/**
 * Falha se desativado (0) ou se já atingiu o teto (>0). Não incrementa.
 */
async function assertGoogleMapsRouteAllowed(prisma, tenantId) {
  const { periodKey, limit, used } = await getGoogleMapsRouteUsageState(prisma, tenantId);
  if (limit === 0) {
    const err = new Error('GOOGLE_MAPS_DISABLED');
    err.code = 'GOOGLE_MAPS_DISABLED';
    err.msg =
      'Rotas Google Maps estão desativadas para esta organização (cota 0 no plano ou no tenant).';
    throw err;
  }
  if (limit > 0 && used >= limit) {
    const err = new Error('GOOGLE_MAPS_QUOTA');
    err.code = 'GOOGLE_MAPS_QUOTA_EXCEEDED';
    err.msg = `Limite mensal de rotas Google Maps (${limit}) foi atingido para esta organização.`;
    throw err;
  }
  return { periodKey, limit, used };
}

/**
 * Incrementa após chamada bem-sucedida ao Google (contabiliza uso real).
 * @returns {Promise<{ periodKey: string; limit: number; usedAfter: number }>}
 */
async function recordGoogleMapsRouteSuccess(prisma, tenantId) {
  const { periodKey } = saoPauloYearMonthFromDate(new Date());
  const limit = await resolveEffectiveGoogleMapsMonthlyLimit(prisma, tenantId);
  const row = await prisma.tenantPlanUsagePeriod.upsert({
    where: { tenantId_periodKey: { tenantId, periodKey } },
    create: { tenantId, periodKey, googleMapsRouteCount: 1 },
    update: { googleMapsRouteCount: { increment: 1 } },
    select: { googleMapsRouteCount: true },
  });
  return { periodKey, limit, usedAfter: row.googleMapsRouteCount };
}

module.exports = {
  pickEffectiveMonthlyLimit,
  resolveEffectiveGoogleMapsMonthlyLimit,
  getGoogleMapsRouteUsageState,
  assertGoogleMapsRouteAllowed,
  recordGoogleMapsRouteSuccess,
};
