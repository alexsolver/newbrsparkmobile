'use strict';

/**
 * Envia um push de teste via Expo para o(s) dispositivo(s) com token registado.
 * Uso:
 *   node scripts/sendTestPushByEmail.js email@x.com
 *   node scripts/sendTestPushByEmail.js email@x.com live-activity
 * (live-activity = mesmo payload de OS/técnico, para o iOS abrir/actualizar a Live Activity com o ícone embutido)
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { sendExpoPushToMany } = require('../src/services/expoPush');
const { resolveGlobalLiveActivityBadgeKey, resolveTenantAppDisplayName } = require('../src/lib/mobileTenantBranding');
const { resolveActiveUsersForDispatchOwnerEmail } = require('../src/lib/userEmailUnique');

const ANDROID_CHANNEL_TECH = 'brspark-tecnico';

function parseArgs() {
  const rest = process.argv.slice(2).filter(Boolean);
  const mode = rest[rest.length - 1] === 'live-activity' || rest[rest.length - 1] === 'la' ? 'la' : 'simple';
  const emailParts = mode === 'la' ? rest.slice(0, -1) : rest;
  const email = emailParts.map((s) => String(s).trim()).find(Boolean) || '';
  return { email, mode };
}

async function main() {
  const { email, mode } = parseArgs();
  if (!email) {
    console.error('Uso: node scripts/sendTestPushByEmail.js email@exemplo.com [live-activity]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const rows = await resolveActiveUsersForDispatchOwnerEmail(prisma, email);
    if (!rows.length) {
      console.error('Nenhum utilizador ativo com este e-mail (nem via AppAccount):', email);
      process.exit(2);
    }
    const userIds = rows.map((r) => r.id);
    const user =
      (await prisma.user.findFirst({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true, role: true, tenantId: true },
        orderBy: { createdAt: 'asc' },
      })) || null;
    if (!user) {
      console.error('Resolução de utilizador inconsistente.');
      process.exit(2);
    }

    const tokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
    if (!tokens.length) {
      console.error(
        'Utilizador(es) encontrado(s) mas sem token Expo (iPhone: abrir app com login, Ajustes → BrSpark → Notificações):',
        user.email,
        '| userIds:',
        userIds.join(',')
      );
      process.exit(3);
    }

    let res;
    if (mode === 'la') {
      const appDisplayName = await resolveTenantAppDisplayName(prisma, user.tenantId, 'BrSpark');
      const liveActivityBadgeKey = await resolveGlobalLiveActivityBadgeKey(prisma, 'brspark-badge');
      const taskId = `test-logo-la-${Date.now()}`;
      res = await sendExpoPushToMany(tokens, {
        title: 'Teste ícone · Live Activity',
        body:
          'Abrindo o cartão de técnico: verifique se o logo aparece à esquerda. FT de teste (não abrir OS).\n\nDeslize para expandir. Ações: Aceitar, Recusar ou OK.',
        categoryId: 'BRSPARK_TECH_ACTIVITY',
        android: { channelId: ANDROID_CHANNEL_TECH, sound: 'default' },
        data: {
          taskId,
          type: 'os_reopened_revision',
          appDisplayName,
          liveActivityBadgeKey,
        },
      });
      console.log('Modo: live-activity (os_reopened_revision) taskId=', taskId, 'liveActivityBadgeKey=', liveActivityBadgeKey);
    } else {
      res = await sendExpoPushToMany(tokens, {
        title: 'Teste BrSpark',
        body: 'Push de teste do backend do painel. Se vê isto, o canal está OK.',
        android: { channelId: ANDROID_CHANNEL_TECH, sound: 'default' },
        data: { type: 'admin_test_push', at: new Date().toISOString() },
      });
    }

    console.log('User:', user.email, user.name || '', `(${user.role})`, 'id=' + user.id);
    console.log('Tokens:', tokens.length, 'Resultado:', res?.ok ? 'ok' : 'erro', res);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
