'use strict';

/**
 * Tenant `COMPANY` onde novos utilizadores da app (registo / espaço prestador) devem ser criados,
 * em vez de criar tenants `CLIENT` ou `PROVIDER` dedicadas.
 *
 * Ordem: `APP_REGISTRATION_SHARED_TENANT_ID` → `APP_REGISTRATION_SHARED_TENANT_SLUG` (omissão `master`).
 */
const DEFAULT_SHARED_SLUG = 'master';

/**
 * @param {import('@prisma/client').Prisma.TransactionClient | import('@prisma/client').PrismaClient} tx
 * @returns {Promise<{ id: string, slug: string, name: string, kind: string } | null>}
 */
async function resolveSharedRegistrationTenant(tx) {
  const idRaw = String(process.env.APP_REGISTRATION_SHARED_TENANT_ID || '').trim();
  if (idRaw) {
    const t = await tx.tenant.findUnique({
      where: { id: idRaw },
      select: { id: true, kind: true, slug: true, name: true },
    });
    if (t && String(t.kind).toUpperCase() === 'COMPANY') return t;
    return null;
  }
  const slugRaw = String(
    process.env.APP_REGISTRATION_SHARED_TENANT_SLUG || DEFAULT_SHARED_SLUG,
  ).trim();
  const t2 = await tx.tenant.findFirst({
    where: { slug: { equals: slugRaw, mode: 'insensitive' } },
    select: { id: true, kind: true, slug: true, name: true },
  });
  if (t2 && String(t2.kind).toUpperCase() === 'COMPANY') return t2;
  return null;
}

/**
 * Tenant COMPANY de registo partilhado da app (`APP_REGISTRATION_SHARED_TENANT_*`, omissão slug `master`).
 * Não deve ser tratada como organização operacional (ex.: política de ponto global).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string|null|undefined} tenantId
 */
async function isSharedAppRegistrationTenantId(client, tenantId) {
  if (!tenantId) return false;
  const shared = await resolveSharedRegistrationTenant(client);
  return !!(shared && String(shared.id) === String(tenantId));
}

module.exports = {
  resolveSharedRegistrationTenant,
  isSharedAppRegistrationTenantId,
  DEFAULT_SHARED_SLUG,
};
