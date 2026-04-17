'use strict';

const { buildEffectiveTenantBranding } = require('./tenantBranding');

function getGlobalAppTenantSlug() {
  return String(process.env.APP_DEFAULT_TENANT_SLUG || 'brspark-app').trim() || 'brspark-app';
}

function getGlobalAppTenantId() {
  return String(process.env.APP_DEFAULT_TENANT_ID || '').trim();
}

function isGlobalAppTenantEntity(tenant) {
  if (!tenant || typeof tenant !== 'object') return false;
  const configuredId = getGlobalAppTenantId();
  const configuredSlug = getGlobalAppTenantSlug();
  const tenantId = String(tenant.id || '').trim();
  const tenantSlug = String(tenant.slug || '').trim().toLowerCase();
  if (configuredId && tenantId && configuredId === tenantId) return true;
  return !!tenantSlug && tenantSlug === configuredSlug.toLowerCase();
}

async function resolveTenantAppDisplayName(prisma, tenantId, fallback = 'BrSpark') {
  const id = String(tenantId || '').trim();
  if (!id) return fallback;
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
      },
    });
    if (!tenant) return fallback;
    const branding = buildEffectiveTenantBranding({
      tenantName: tenant.name,
      planFeatures: tenant.subscription?.plan?.features,
      tenantFeatures: tenant.features,
    });
    return String(branding.effective?.appDisplayName || tenant.name || fallback).trim() || fallback;
  } catch {
    return fallback;
  }
}

async function resolveGlobalLiveActivityBadgeKey(prisma, fallback = 'brspark-badge') {
  const configuredId = getGlobalAppTenantId();
  const configuredSlug = getGlobalAppTenantSlug();
  try {
    const tenant = configuredId
      ? await prisma.tenant.findUnique({
          where: { id: configuredId },
          include: { subscription: { include: { plan: true } } },
        })
      : await prisma.tenant.findFirst({
          where: { slug: { equals: configuredSlug, mode: 'insensitive' } },
          include: { subscription: { include: { plan: true } } },
        });
    if (!tenant) return fallback;
    const branding = buildEffectiveTenantBranding({
      tenantName: tenant.name,
      planFeatures: tenant.subscription?.plan?.features,
      tenantFeatures: tenant.features,
    });
    return String(branding.saved?.liveActivityBadgeKey || fallback).trim() || fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  getGlobalAppTenantSlug,
  isGlobalAppTenantEntity,
  resolveGlobalLiveActivityBadgeKey,
  resolveTenantAppDisplayName,
};
