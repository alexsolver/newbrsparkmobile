'use strict';

const PLATFORM_SCOPE = 'platform';
const NETWORK_SCOPE = 'network';
const TENANT_SCOPE = 'tenant';
const PUBLIC_SCOPE = 'public';

const PLATFORM_OWNER = 'PLATFORM_OWNER';

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

function uniqueCapabilities(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean).map((x) => String(x).trim()))];
}

const PLATFORM_CAPABILITIES = [
  'platform.access',
  'platform.dashboard.read',
  'platform.tenants.read',
  'platform.tenants.write',
  'platform.users.read',
  'platform.users.write',
  'platform.users.impersonate',
  'platform.audit.read',
  'platform.integrations.read',
  'platform.integrations.write',
  'platform.system.read',
  'platform.system.write',
  'platform.notifications.read',
  'platform.notifications.write',
  'network.access',
  'network.providers.read',
  'network.providers.write',
  'tenant.access.any',
  'tenant.users.read.any',
  'tenant.users.write.any',
  'tenant.operations.read.any',
  'tenant.operations.write.any',
  'tenant.branding.read.any',
  'tenant.branding.write.any',
  'tenant.technicianRegistration.read.any',
  'tenant.technicianRegistration.write.any',
  'mobile.mode.services',
  'mobile.mode.provider',
  'mobile.provider.quickActions',
  'mobile.provider.osSearch',
  'mobile.workTime.access',
  'mobile.admin.quickActions',
];

const TENANT_ADMIN_CAPABILITIES = [
  'tenant.access.self',
  'tenant.read.self',
  'tenant.write.self',
  'tenant.branding.read.self',
  'tenant.branding.write.self',
  'tenant.users.read.self',
  'tenant.users.write.self',
  'tenant.users.impersonate.self',
  'tenant.operations.read.self',
  'tenant.operations.write.self',
  'tenant.technicianRegistration.read.self',
  'tenant.technicianRegistration.write.self',
  'tenant.providers.read.self',
  'mobile.mode.services',
  'mobile.mode.provider',
  'mobile.provider.quickActions',
  'mobile.provider.osSearch',
  'mobile.workTime.access',
  'mobile.admin.quickActions',
];

const MANAGER_CAPABILITIES = [
  'tenant.access.self',
  'tenant.read.self',
  'tenant.users.read.self',
  'tenant.users.write.limited',
  'tenant.operations.read.self',
  'tenant.operations.write.self',
  'tenant.technicianRegistration.read.self',
  'tenant.technicianRegistration.write.self',
  'tenant.providers.read.self',
  'mobile.mode.services',
  'mobile.mode.provider',
  'mobile.provider.quickActions',
  'mobile.provider.osSearch',
  'mobile.workTime.access',
];

function buildAdminAuthorization(admin) {
  if (!admin) {
    return {
      actorType: 'anonymous',
      roleKey: null,
      scope: PUBLIC_SCOPE,
      accessibleScopes: [PUBLIC_SCOPE],
      contextTenantId: null,
      panelFilterTenantId: null,
      capabilities: [],
      isPlatform: false,
      isTenantScoped: false,
      canImpersonate: false,
    };
  }

  const platformPanelFilterId = String(admin.panelContextTenantId || '').trim() || null;

  if (!admin.panelUser) {
    const capabilities = uniqueCapabilities(PLATFORM_CAPABILITIES);
    return {
      actorType: 'legacy_admin',
      roleKey: PLATFORM_OWNER,
      scope: PLATFORM_SCOPE,
      accessibleScopes: [PLATFORM_SCOPE, NETWORK_SCOPE, TENANT_SCOPE, PUBLIC_SCOPE],
      contextTenantId: null,
      panelFilterTenantId: platformPanelFilterId,
      capabilities,
      isPlatform: true,
      isTenantScoped: false,
      canImpersonate: true,
    };
  }

  const role = normalizeRole(admin.role);
  if (role === 'SAAS_ADMIN') {
    const capabilities = uniqueCapabilities(PLATFORM_CAPABILITIES);
    return {
      actorType: 'panel_user',
      roleKey: role,
      scope: PLATFORM_SCOPE,
      accessibleScopes: [PLATFORM_SCOPE, NETWORK_SCOPE, TENANT_SCOPE, PUBLIC_SCOPE],
      contextTenantId: null,
      panelFilterTenantId: platformPanelFilterId,
      capabilities,
      isPlatform: true,
      isTenantScoped: false,
      canImpersonate: true,
    };
  }

  if (role === 'TENANT_ADMIN') {
    const capabilities = uniqueCapabilities(TENANT_ADMIN_CAPABILITIES);
    return {
      actorType: 'panel_user',
      roleKey: role,
      scope: TENANT_SCOPE,
      accessibleScopes: [TENANT_SCOPE, PUBLIC_SCOPE],
      contextTenantId: String(admin.tenantId || '').trim() || null,
      panelFilterTenantId: null,
      capabilities,
      isPlatform: false,
      isTenantScoped: true,
      canImpersonate: true,
    };
  }

  const capabilities = uniqueCapabilities(MANAGER_CAPABILITIES);
  return {
    actorType: 'panel_user',
    roleKey: role || 'PANEL_USER',
    scope: TENANT_SCOPE,
    accessibleScopes: [TENANT_SCOPE, PUBLIC_SCOPE],
    contextTenantId: String(admin.tenantId || '').trim() || null,
    panelFilterTenantId: null,
    capabilities,
    isPlatform: false,
    isTenantScoped: true,
    canImpersonate: false,
  };
}

function hasCapability(subject, capability) {
  const caps = Array.isArray(subject?.capabilities) ? subject.capabilities : [];
  return caps.includes(String(capability || '').trim());
}

function isPlatformAdmin(subject) {
  return !!subject?.isPlatform;
}

function isTenantScoped(subject) {
  return !!subject?.isTenantScoped;
}

function assertTenantAccess(subject, tenantId) {
  const targetTenantId = String(tenantId || '').trim();
  if (!targetTenantId) return true;
  if (isPlatformAdmin(subject)) return true;
  const scopeTenantId = String(subject?.contextTenantId || '').trim();
  return !!scopeTenantId && scopeTenantId === targetTenantId;
}

function resolveScopedTenantId(subject, requestedTenantId = null) {
  const panelF = String(subject?.panelFilterTenantId || '').trim();
  if (subject?.isPlatform && panelF) return panelF;
  if (isTenantScoped(subject) && subject?.contextTenantId) {
    return String(subject.contextTenantId).trim();
  }
  const raw = String(requestedTenantId || '').trim();
  return raw || null;
}

function applyTenantScopeToWhere(subject, where = {}, tenantField = 'tenantId') {
  if (!isTenantScoped(subject) || !subject?.contextTenantId) return where;
  return {
    ...where,
    [tenantField]: String(subject.contextTenantId).trim(),
  };
}

function nonPlatformUserReadWhere(subject) {
  if (isPlatformAdmin(subject)) return {};
  return {
    NOT: { role: 'SAAS_ADMIN' },
  };
}

function buildPanelSessionBootstrap(admin) {
  const authz = buildAdminAuthorization(admin);
  let context;
  if (authz.scope === PLATFORM_SCOPE) {
    const ptid = String(admin?.panelContextTenantId || '').trim();
    if (ptid) {
      const nm = String(admin.panelContextTenantName || '').trim();
      const sl = String(admin.panelContextTenantSlug || '').trim();
      context = {
        scope: PLATFORM_SCOPE,
        label: nm || sl || 'Organização',
        tenantId: ptid,
        tenantName: nm || null,
        tenantSlug: sl || null,
      };
    } else {
      context = {
        scope: PLATFORM_SCOPE,
        label: 'Plataforma Aria',
        tenantId: null,
        tenantName: null,
        tenantSlug: null,
      };
    }
  } else {
    context = {
      scope: TENANT_SCOPE,
      label: admin?.tenantName ? `Tenant ${admin.tenantName}` : 'Tenant',
      tenantId: admin?.tenantId || null,
      tenantName: admin?.tenantName || null,
      tenantSlug: admin?.tenantSlug || null,
    };
  }

  return {
    authz: {
      scope: authz.scope,
      roleKey: authz.roleKey,
      contextTenantId: authz.contextTenantId,
      panelFilterTenantId: authz.panelFilterTenantId || null,
      accessibleScopes: authz.accessibleScopes,
      isPlatform: authz.isPlatform,
      isTenantScoped: authz.isTenantScoped,
      canImpersonate: authz.canImpersonate,
    },
    context,
    capabilities: authz.capabilities,
  };
}

function buildAppAuthorization(user) {
  const role = normalizeRole(user?.role);
  const technicianStatus = normalizeRole(user?.technicianProfile?.status);
  const providerEligible =
    technicianStatus === 'ACTIVE' ||
    role === 'PROVIDER' ||
    role === 'MANAGER' ||
    role === 'TENANT_ADMIN' ||
    role === 'SAAS_ADMIN';
  const adminEligible = role === 'MANAGER' || role === 'TENANT_ADMIN' || role === 'SAAS_ADMIN';
  const capabilities = [
    'mobile.mode.services',
    // Modo prestador no app: activo por defeito em todas as tenants (JWT do app).
    'mobile.mode.provider',
    'mobile.provider.quickActions',
    'mobile.provider.osSearch',
    ...(providerEligible && role !== 'USER' ? ['mobile.workTime.access'] : []),
    ...(adminEligible ? ['mobile.admin.quickActions'] : []),
  ];

  return {
    scope: TENANT_SCOPE,
    roleKey: role || 'USER',
    contextTenantId: String(user?.tenantId || '').trim() || null,
    accessibleScopes: [TENANT_SCOPE, PUBLIC_SCOPE],
    isPlatform: false,
    isTenantScoped: true,
    canImpersonate: false,
    capabilities: uniqueCapabilities(capabilities),
  };
}

function canManageTenantAppData(user) {
  const authz = buildAppAuthorization(user);
  return authz.roleKey === 'MANAGER' || authz.roleKey === 'TENANT_ADMIN' || authz.roleKey === 'SAAS_ADMIN';
}

module.exports = {
  PLATFORM_SCOPE,
  NETWORK_SCOPE,
  TENANT_SCOPE,
  PUBLIC_SCOPE,
  PLATFORM_OWNER,
  normalizeRole,
  uniqueCapabilities,
  buildAdminAuthorization,
  buildPanelSessionBootstrap,
  buildAppAuthorization,
  canManageTenantAppData,
  hasCapability,
  isPlatformAdmin,
  isTenantScoped,
  assertTenantAccess,
  resolveScopedTenantId,
  applyTenantScopeToWhere,
  nonPlatformUserReadWhere,
};
