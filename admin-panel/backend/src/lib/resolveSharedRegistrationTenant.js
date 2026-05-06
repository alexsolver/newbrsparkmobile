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
 * True se `tenantId` é a tenant COMPANY de registo partilhado (piscina da app).
 * Usa `resolveSharedRegistrationTenant` e, em fallback, o slug na linha — evita falhas quando
 * `APP_REGISTRATION_SHARED_TENANT_ID` no env não coincide com o id real (ex.: «Aria App (master)» no painel).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string|null|undefined} tenantId
 */
async function tenantIsSharedAppRegistrationPool(client, tenantId) {
  if (!tenantId) return false;
  const shared = await resolveSharedRegistrationTenant(client);
  if (shared && String(shared.id) === String(tenantId)) return true;
  const row = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, kind: true },
  });
  if (!row?.slug || String(row.kind).toUpperCase() !== 'COMPANY') return false;
  const slugEnv = String(process.env.APP_REGISTRATION_SHARED_TENANT_SLUG || '').trim().toLowerCase();
  const want = slugEnv || DEFAULT_SHARED_SLUG.toLowerCase();
  return String(row.slug).toLowerCase() === want;
}

/**
 * Tenant COMPANY de registo partilhado da app (`APP_REGISTRATION_SHARED_TENANT_*`, omissão slug `master`).
 * Não deve ser tratada como organização operacional (ex.: política de ponto global).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string|null|undefined} tenantId
 */
async function isSharedAppRegistrationTenantId(client, tenantId) {
  return tenantIsSharedAppRegistrationPool(client, tenantId);
}

module.exports = {
  resolveSharedRegistrationTenant,
  isSharedAppRegistrationTenantId,
  tenantIsSharedAppRegistrationPool,
  DEFAULT_SHARED_SLUG,
};
