'use strict';

const { resolveScopedTenantId } = require('./authorization');

/**
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {import('express').Request} req
 * @param {{ bridgeInternal?: boolean, reportsApiKey?: boolean }} [opts]
 */
async function applyPrismaRlsSession(tx, req, opts = {}) {
  if (opts.bridgeInternal) {
    await tx.$executeRaw`SELECT set_config('app.bridge_internal', '1', true)`;
    await tx.$executeRaw`SELECT set_config('app.admin_is_platform', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.admin_panel_tenant_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_email', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.reports_api', '', true)`;
    return;
  }

  if (opts.reportsApiKey) {
    await tx.$executeRaw`SELECT set_config('app.reports_api', '1', true)`;
    await tx.$executeRaw`SELECT set_config('app.bridge_internal', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.admin_is_platform', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.admin_panel_tenant_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_email', '', true)`;
    return;
  }

  await tx.$executeRaw`SELECT set_config('app.bridge_internal', '', true)`;
  await tx.$executeRaw`SELECT set_config('app.reports_api', '', true)`;

  const admin = req.admin;
  const authz = req.authorization;

  if (admin && authz) {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_email', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;

    if (authz.isPlatform) {
      const scoped = resolveScopedTenantId(authz);
      if (scoped) {
        await tx.$executeRaw`SELECT set_config('app.admin_is_platform', '', true)`;
        await tx.$executeRaw`SELECT set_config('app.admin_panel_tenant_id', ${scoped}, true)`;
      } else {
        await tx.$executeRaw`SELECT set_config('app.admin_is_platform', 'true', true)`;
        await tx.$executeRaw`SELECT set_config('app.admin_panel_tenant_id', '', true)`;
      }
    } else {
      await tx.$executeRaw`SELECT set_config('app.admin_is_platform', '', true)`;
      const panelTid =
        String(authz.contextTenantId || admin.tenantId || '').trim() ||
        String(admin.tenantId || '').trim();
      await tx.$executeRaw`SELECT set_config('app.admin_panel_tenant_id', ${panelTid}, true)`;
    }
    return;
  }

  await tx.$executeRaw`SELECT set_config('app.admin_is_platform', '', true)`;
  await tx.$executeRaw`SELECT set_config('app.admin_panel_tenant_id', '', true)`;

  const u = req.user || req.appUser;
  if (!u) {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_user_email', '', true)`;
    return;
  }

  const tenantId = String(u.tenantId || '').trim();
  const userId = String(u.id || '').trim();
  const email = String(u.email || '').trim();

  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.current_user_email', ${email}, true)`;
}

module.exports = {
  applyPrismaRlsSession,
};
