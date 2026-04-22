'use strict';

/** Mensagem única para conflitos de registo no app (alinhado ao login multi-tenant). */
const APP_REGISTER_EMAIL_TAKEN_PT =
  'Este e-mail já está associado a uma conta BrSpark. Inicie sessão; se aparecer mais do que uma organização, escolha a correta. Para um registo novo, utilize outro e-mail.';

/**
 * Bloqueia `POST /api/register` e criação OTP quando o e-mail já existe em qualquer tenant.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} emailNorm
 * @returns {Promise<string|null>} mensagem de erro ou null
 */
async function assertEmailFreeAcrossAllTenants(prisma, emailNorm) {
  const e = String(emailNorm || '').trim().toLowerCase();
  if (!e) return 'E-mail inválido.';
  const row = await prisma.user.findFirst({
    where: { email: { equals: e, mode: 'insensitive' } },
    select: { id: true },
  });
  return row ? APP_REGISTER_EMAIL_TAKEN_PT : null;
}

/**
 * Após libertar o e-mail na tenant master (reclaim), ainda não pode existir **conta ativa**
 * com o mesmo e-mail noutra organização — evita duplicar identidade no marketplace.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} emailNorm
 * @param {string} defaultTenantId
 * @returns {Promise<string|null>}
 */
async function assertNoActiveSameEmailOutsideDefaultTenant(prisma, emailNorm, defaultTenantId) {
  const e = String(emailNorm || '').trim().toLowerCase();
  const tid = String(defaultTenantId || '').trim();
  if (!e || !tid) return null;
  const row = await prisma.user.findFirst({
    where: {
      email: { equals: e, mode: 'insensitive' },
      isActive: true,
      tenantId: { not: tid },
    },
    select: { id: true },
  });
  return row ? APP_REGISTER_EMAIL_TAKEN_PT : null;
}

module.exports = {
  APP_REGISTER_EMAIL_TAKEN_PT,
  assertEmailFreeAcrossAllTenants,
  assertNoActiveSameEmailOutsideDefaultTenant,
};
