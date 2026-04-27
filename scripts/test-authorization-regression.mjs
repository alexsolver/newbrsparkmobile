import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PLATFORM_SCOPE,
  TENANT_SCOPE,
  PUBLIC_SCOPE,
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
} = require('../admin-panel/backend/src/lib/authorization.js');
const { auditContextMetadata } = require('../admin-panel/backend/src/lib/auditActor.js');

function run() {
  const anonymous = buildAdminAuthorization(null);
  assert.equal(anonymous.scope, PUBLIC_SCOPE);
  assert.equal(anonymous.isPlatform, false);
  assert.equal(anonymous.canImpersonate, false);

  const legacyAdmin = buildAdminAuthorization({
    panelUser: false,
    id: 'adm-1',
    email: 'ops@brspark.com',
  });
  assert.equal(legacyAdmin.scope, PLATFORM_SCOPE);
  assert.equal(isPlatformAdmin(legacyAdmin), true);
  assert.equal(hasCapability(legacyAdmin, 'platform.users.impersonate'), true);
  assert.equal(assertTenantAccess(legacyAdmin, 'tenant-a'), true);
  assert.equal(resolveScopedTenantId(legacyAdmin, 'tenant-b'), 'tenant-b');

  const tenantAdmin = buildAdminAuthorization({
    panelUser: true,
    userId: 'user-1',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-a',
    tenantName: 'Tenant A',
    tenantSlug: 'tenant-a',
  });
  assert.equal(tenantAdmin.scope, TENANT_SCOPE);
  assert.equal(isTenantScoped(tenantAdmin), true);
  assert.equal(tenantAdmin.contextTenantId, 'tenant-a');
  assert.equal(hasCapability(tenantAdmin, 'tenant.users.read.self'), true);
  assert.equal(hasCapability(tenantAdmin, 'platform.tenants.write'), false);
  assert.equal(assertTenantAccess(tenantAdmin, 'tenant-a'), true);
  assert.equal(assertTenantAccess(tenantAdmin, 'tenant-b'), false);
  assert.equal(resolveScopedTenantId(tenantAdmin, 'tenant-b'), 'tenant-a');
  assert.deepEqual(applyTenantScopeToWhere(tenantAdmin, { status: 'ACTIVE' }), {
    status: 'ACTIVE',
    tenantId: 'tenant-a',
  });

  const manager = buildAdminAuthorization({
    panelUser: true,
    userId: 'user-2',
    role: 'MANAGER',
    tenantId: 'tenant-a',
  });
  assert.equal(manager.scope, TENANT_SCOPE);
  assert.equal(manager.canImpersonate, false);
  assert.equal(hasCapability(manager, 'tenant.users.write.limited'), true);
  assert.equal(hasCapability(manager, 'tenant.users.impersonate.self'), false);

  const bootstrap = buildPanelSessionBootstrap({
    panelUser: true,
    userId: 'user-1',
    role: 'TENANT_ADMIN',
    tenantId: 'tenant-a',
    tenantName: 'Tenant A',
    tenantSlug: 'tenant-a',
  });
  assert.equal(bootstrap.authz.scope, TENANT_SCOPE);
  assert.equal(bootstrap.context.tenantId, 'tenant-a');
  assert.equal(bootstrap.context.tenantName, 'Tenant A');
  assert.ok(Array.isArray(bootstrap.capabilities));
  assert.ok(bootstrap.capabilities.includes('mobile.mode.provider'));

  const appUser = buildAppAuthorization({
    id: 'app-1',
    tenantId: 'tenant-a',
    role: 'USER',
  });
  assert.equal(appUser.scope, TENANT_SCOPE);
  assert.equal(hasCapability(appUser, 'mobile.mode.services'), true);
  assert.equal(hasCapability(appUser, 'mobile.mode.provider'), true);
  assert.equal(hasCapability(appUser, 'mobile.provider.quickActions'), true);
  assert.equal(hasCapability(appUser, 'mobile.provider.osSearch'), true);
  assert.equal(hasCapability(appUser, 'mobile.workTime.access'), false);

  const appProvider = buildAppAuthorization({
    id: 'app-2',
    tenantId: 'tenant-a',
    role: 'USER',
    technicianProfile: { status: 'ACTIVE' },
  });
  assert.equal(hasCapability(appProvider, 'mobile.mode.provider'), true);
  assert.equal(hasCapability(appProvider, 'mobile.provider.quickActions'), true);
  assert.equal(hasCapability(appProvider, 'mobile.provider.osSearch'), true);
  assert.equal(hasCapability(appProvider, 'mobile.workTime.access'), false);

  const appManager = buildAppAuthorization({
    id: 'app-3',
    tenantId: 'tenant-a',
    role: 'MANAGER',
  });
  assert.equal(hasCapability(appManager, 'mobile.mode.provider'), true);
  assert.equal(hasCapability(appManager, 'mobile.workTime.access'), true);
  assert.equal(hasCapability(appManager, 'mobile.admin.quickActions'), true);
  assert.equal(canManageTenantAppData({ tenantId: 'tenant-a', role: 'MANAGER' }), true);
  assert.equal(canManageTenantAppData({ tenantId: 'tenant-a', role: 'USER' }), false);

  assert.deepEqual(nonPlatformUserReadWhere(tenantAdmin), { NOT: { role: 'SAAS_ADMIN' } });
  assert.deepEqual(nonPlatformUserReadWhere(legacyAdmin), {});

  const auditMeta = auditContextMetadata(
    { authorization: tenantAdmin },
    { targetTenantId: 'tenant-a', targetUserId: 'user-1' },
  );
  assert.deepEqual(auditMeta, {
    actorScope: TENANT_SCOPE,
    actorRole: 'TENANT_ADMIN',
    contextTenantId: 'tenant-a',
    targetTenantId: 'tenant-a',
    targetUserId: 'user-1',
  });
}

run();
console.log('[OK] authorization regression checks passed');
