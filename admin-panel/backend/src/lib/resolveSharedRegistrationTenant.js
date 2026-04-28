'use strict';

/**
 * Tenant `COMPANY` onde novos utilizadores da app (registo / espaço prestador) devem ser criados,
 * em vez de criar tenants `CLIENT` ou `PROVIDER` dedicadas.
 *
 * Ordem: `APP_REGISTRATION_SHARED_TENANT_ID` → `APP_REGISTRATION_SHARED_TENANT_SLUG` (omissão `brspark-app`).
 */
const DEFAULT_SHARED_SLUG = 'brspark-app';

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

module.exports = {
  resolveSharedRegistrationTenant,
  DEFAULT_SHARED_SLUG,
};
