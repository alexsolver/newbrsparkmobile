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
    const user = await prisma.user.findFirst({
      where: { isActive: true, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
    if (!user) {
      console.error('Nenhum utilizador ativo com este e-mail:', email);
      process.exit(2);
    }

    const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
    if (!tokens.length) {
      console.error(
        'Utilizador encontrado mas sem token Expo (abrir o app com login e notificações activas):',
        user.email
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
        body: 'Abrindo o cartão de técnico: verifique se o logo aparece à esquerda. FT de teste (não abrir OS).',
        subtitle: 'Deslize para baixo — Aceitar, Recusar ou OK.',
        interruptionLevel: 'active',
        categoryId: 'BRSPARK_TECH_ACTIVITY',
        channelId: ANDROID_CHANNEL_TECH,
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
        channelId: ANDROID_CHANNEL_TECH,
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
