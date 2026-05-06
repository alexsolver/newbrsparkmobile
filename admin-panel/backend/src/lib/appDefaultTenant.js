'use strict';

const prisma = require('../db');

/**
 * Tenant org Aria (seed: nome «Aria», slug `aria`).
 * Usada por fluxos administrativos / legado. O registo público no app usa a tenant COMPANY partilhada
 * (`resolveSharedRegistrationTenant`, slug omissão `master`), não esta tenant.
 *
 * Opcional: `APP_DEFAULT_TENANT_ID` ou `APP_DEFAULT_TENANT_SLUG` substituem (staging / testes).
 */
const APP_MOBILE_MASTER_TENANT_SLUG = 'aria';

/**
 * @returns {Promise<string|null>} id da tenant ou null se não existir na base
 */
async function resolveAppDefaultTenantId() {
  const idRaw = (process.env.APP_DEFAULT_TENANT_ID || '').trim();
  if (idRaw) {
    const t = await prisma.tenant.findUnique({ where: { id: idRaw } });
    return t ? t.id : null;
  }
  const slugRaw = (process.env.APP_DEFAULT_TENANT_SLUG || '').trim();
  const slugToLookup = slugRaw || APP_MOBILE_MASTER_TENANT_SLUG;
  const t = await prisma.tenant.findFirst({
    where: { slug: { equals: slugToLookup, mode: 'insensitive' } },
  });
  return t ? t.id : null;
}

/**
 * Tenant org legada do painel / OTP (slug `aria` por omissão). Usa o mesmo critério que
 * `APP_DEFAULT_TENANT_*`, com recurso ao slug da linha quando o env não resolve o id.
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} client
 * @param {string|null|undefined} tenantId
 * @returns {Promise<boolean>}
 */
async function tenantIsAppMobileMaster(client, tenantId) {
  if (!tenantId) return false;
  const resolved = await resolveAppDefaultTenantId();
  if (resolved && String(resolved) === String(tenantId)) return true;
  const row = await client.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  if (!row?.slug) return false;
  const envSlug = String(process.env.APP_DEFAULT_TENANT_SLUG || '').trim().toLowerCase();
  const want = envSlug || APP_MOBILE_MASTER_TENANT_SLUG.toLowerCase();
  return String(row.slug).toLowerCase() === want;
}

module.exports = {
  APP_MOBILE_MASTER_TENANT_SLUG,
  resolveAppDefaultTenantId,
  tenantIsAppMobileMaster,
};
