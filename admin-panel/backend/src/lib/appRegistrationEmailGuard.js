'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/** Mensagem única para conflitos de registo no app (alinhado ao login multi-tenant). */
const APP_REGISTER_EMAIL_TAKEN_PT =
  'Este e-mail já está associado a uma conta BrSpark. Inicie sessão; se aparecer mais do que uma organização, escolha a correta. Para um registo novo, utilize outro e-mail.';

/**
 * `AppAccount` sem nenhum `User` ativo (ex.: exclusão parcial / legado) — liberta o e-mail para novo registo.
 * Alinhado ao payload de `DELETE /api/me` em `account.js`.
 */
async function reclaimOrphanAppAccountIfAllUsersInactive(prisma, emailNorm) {
  const e = String(emailNorm || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return;
  const acc = await prisma.appAccount.findUnique({ where: { emailNorm: e }, select: { id: true } });
  if (!acc) return;
  const active = await prisma.user.count({ where: { appAccountId: acc.id, isActive: true } });
  if (active > 0) return;

  const rows = await prisma.user.findMany({
    where: { appAccountId: acc.id },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  await prisma.$transaction(async (tx) => {
    if (ids.length) {
      await tx.pushToken.deleteMany({ where: { userId: { in: ids } } });
      await tx.appRefreshSession.deleteMany({ where: { userId: { in: ids } } });
      await tx.otpLoginChallenge.deleteMany({
        where: { target: { equals: e, mode: 'insensitive' } },
      });
      for (const id of ids) {
        await tx.user.update({
          where: { id },
          data: {
            name: 'Usuário Excluído',
            email: `deleted_${id}@brspark.com`,
            password: randomPassword,
            phone: null,
            avatarUrl: null,
            addressJson: null,
            personalDocuments: null,
            faceEnrollmentPhotos: null,
            comprefaceRecognitionSync: null,
            employeeMatricula: null,
            preferredChatLocale: null,
            emailVerificationToken: null,
            emailVerificationExpiresAt: null,
            emailVerifiedAt: null,
            currentSessionId: null,
            currentDeviceId: null,
            isActive: false,
            appAccountId: null,
          },
        });
      }
    }
    await tx.appAccount.delete({ where: { id: acc.id } }).catch(() => {});
  });
}

/**
 * Bloqueia `POST /api/register` e criação OTP quando o e-mail de login já existe (`AppAccount`)
 * ou ainda existe filiação legada **ativa** com esse `User.email`.
 *
 * Após exclusão de conta, pode ficar `AppAccount` sem utilizadores ativos — nesse caso limpa-se aqui
 * para permitir re-registo com o mesmo e-mail (LGPD / retenção).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} emailNorm
 * @returns {Promise<string|null>} mensagem de erro ou null
 */
async function assertEmailFreeAcrossAllTenants(prisma, emailNorm) {
  const e = String(emailNorm || '').trim().toLowerCase();
  if (!e) return 'E-mail inválido.';

  /** `require` em runtime evita dependência circular com `otpLoginService`. */
  const { releaseDeadAccountSlotsForRegisterGlobal } = require('./otpLoginService');
  await releaseDeadAccountSlotsForRegisterGlobal(prisma, { emailNorm: e });

  await reclaimOrphanAppAccountIfAllUsersInactive(prisma, e);

  const acc = await prisma.appAccount.findUnique({ where: { emailNorm: e }, select: { id: true } });
  if (acc) return APP_REGISTER_EMAIL_TAKEN_PT;

  const legacy = await prisma.user.findFirst({
    where: { email: { equals: e, mode: 'insensitive' }, appAccountId: null, isActive: true },
    select: { id: true },
  });
  return legacy ? APP_REGISTER_EMAIL_TAKEN_PT : null;
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
  const acc = await prisma.appAccount.findUnique({ where: { emailNorm: e }, select: { id: true } });
  if (acc) {
    const row = await prisma.user.findFirst({
      where: { appAccountId: acc.id, isActive: true, tenantId: { not: tid } },
      select: { id: true },
    });
    return row ? APP_REGISTER_EMAIL_TAKEN_PT : null;
  }
  const row = await prisma.user.findFirst({
    where: {
      email: { equals: e, mode: 'insensitive' },
      isActive: true,
      tenantId: { not: tid },
      appAccountId: null,
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
