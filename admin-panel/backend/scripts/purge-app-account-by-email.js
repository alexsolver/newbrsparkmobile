'use strict';

/**
 * Remove definitivamente `AppAccount` e todos os `User` ligados a um e-mail de login (Node/Prisma).
 *
 *   cd admin-panel/backend && EMAIL=alguem@dominio.com node scripts/purge-app-account-by-email.js
 *   EMAIL=... node scripts/purge-app-account-by-email.js --apply --confirm=PURGE-APP-ACCOUNT-BY-EMAIL
 *
 * Apaga também desafios OTP com `target` igual ao e-mail (normalizado).
 */

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  ...(process.env.NODE_ENV === 'production' ? {} : { override: true }),
});

const prisma = require('../src/db');

const REQUIRED_CONFIRM = 'PURGE-APP-ACCOUNT-BY-EMAIL';

function parseArgs(argv) {
  const out = { apply: false, confirm: '' };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a.startsWith('--confirm=')) out.confirm = String(a.slice(10)).trim();
  }
  return out;
}

function buildUserWhereForLoginEmail(emailRaw) {
  const norm = String(emailRaw || '').trim().toLowerCase();
  if (!norm || !norm.includes('@')) return null;
  const at = norm.indexOf('@');
  const local = norm.slice(0, at);
  const synthFrag = `${local}+brspark.ws.`;
  return {
    OR: [
      { email: { equals: norm, mode: 'insensitive' } },
      { email: { contains: synthFrag, mode: 'insensitive' } },
    ],
  };
}

async function main() {
  const { apply, confirm } = parseArgs(process.argv);
  const emailRaw = String(process.env.EMAIL || '').trim();
  if (!emailRaw) {
    console.error('[purge-email] Defina EMAIL=exemplo@dominio.com');
    process.exit(1);
  }
  const emailNorm = emailRaw.toLowerCase();
  const userWhereExtra = buildUserWhereForLoginEmail(emailNorm);
  if (!userWhereExtra) {
    console.error('[purge-email] E-mail inválido.');
    process.exit(1);
  }

  const appAccount = await prisma.appAccount.findUnique({
    where: { emailNorm },
    select: { id: true, emailNorm: true },
  });

  const userOr = [...userWhereExtra.OR];
  if (appAccount) {
    userOr.push({ appAccountId: appAccount.id });
  }

  const users = await prisma.user.findMany({
    where: { OR: userOr },
    select: { id: true, email: true, tenantId: true, appAccountId: true },
  });
  const userIds = [...new Set(users.map((u) => u.id))];

  console.log(`[purge-email] Alvo login: ${emailNorm}`);
  console.log(`[purge-email] AppAccount: ${appAccount ? appAccount.id : '(não encontrado)'}`);
  console.log(`[purge-email] User rows: ${userIds.length}`);
  users.slice(0, 30).forEach((u) => console.log(`   - ${u.id}  ${u.email}`));
  if (users.length > 30) console.log(`   ... +${users.length - 30}`);

  const otpCount = await prisma.otpLoginChallenge.count({
    where: { target: { equals: emailNorm, mode: 'insensitive' } },
  });
  console.log(`[purge-email] OTP challenges (target): ${otpCount}`);

  if (!apply) {
    console.log('\n[purge-email] Dry-run. Para aplicar:');
    console.log(`   EMAIL="${emailRaw}" node scripts/purge-app-account-by-email.js --apply --confirm=${REQUIRED_CONFIRM}`);
    return;
  }

  if (confirm !== REQUIRED_CONFIRM) {
    console.error(`[purge-email] Confirmação inválida. Use: --confirm=${REQUIRED_CONFIRM}`);
    process.exit(1);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.otpLoginChallenge.deleteMany({
        where: { target: { equals: emailNorm, mode: 'insensitive' } },
      });

      for (const uid of userIds) {
        await tx.auditLog.updateMany({ where: { userId: uid }, data: { userId: null } });
        await tx.pushToken.deleteMany({ where: { userId: uid } });
        await tx.appRefreshSession.deleteMany({ where: { userId: uid } });
        await tx.user.delete({ where: { id: uid } });
      }

      if (appAccount) {
        await tx.appAccount.delete({ where: { id: appAccount.id } });
      }
    },
    { timeout: 300_000 },
  );

  console.log('[purge-email] Concluído.');
}

main()
  .catch((e) => {
    console.error('[purge-email] Erro:', e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
