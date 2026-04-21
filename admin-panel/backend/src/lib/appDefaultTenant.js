'use strict';

const prisma = require('../db');

/**
 * Tenant master BrSpark (seed: nome «BrSpark», slug `brspark`).
 * Todo o registo via app móvel (`POST /api/register`, OAuth sem conta, OTP registo) usa esta tenant por omissão.
 *
 * Opcional: `APP_DEFAULT_TENANT_ID` ou `APP_DEFAULT_TENANT_SLUG` substituem (staging / testes).
 */
const APP_MOBILE_MASTER_TENANT_SLUG = 'brspark';

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

module.exports = {
  APP_MOBILE_MASTER_TENANT_SLUG,
  resolveAppDefaultTenantId,
};
