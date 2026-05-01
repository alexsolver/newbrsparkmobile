#!/usr/bin/env node
'use strict';

/**
 * Remove dados de um e-mail da app (User, AppAccount, candidaturas tech-reg, dados por ownerEmail).
 * Ordem respeita FKs (AuditLog/PushToken sem cascade; candidaturas antes do User).
 *
 * Uso (admin-panel/backend, com .env e DATABASE_URL):
 *   node scripts/deleteUserDataByEmail.js --dry-run alexsolver@gmail.com
 *   node scripts/deleteUserDataByEmail.js alexsolver@gmail.com
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../src/db');

function normEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const emailArg = process.argv.filter((a) => !a.startsWith('--') && !a.endsWith('.js')).pop();
  if (!emailArg || emailArg === 'deleteUserDataByEmail.js') {
    console.error(
      'Uso:\n  node scripts/deleteUserDataByEmail.js [--dry-run] <email>\nEx.: node scripts/deleteUserDataByEmail.js alexsolver@gmail.com',
    );
    process.exit(1);
  }

  const emailNorm = normEmail(emailArg);
  if (!emailNorm.includes('@')) {
    console.error('E-mail inválido:', emailArg);
    process.exit(1);
  }

  const acc = await prisma.appAccount.findUnique({
    where: { emailNorm },
    select: { id: true, emailNorm: true },
  });

  const usersByAccount = acc
    ? await prisma.user.findMany({
        where: { appAccountId: acc.id },
        select: { id: true, email: true, tenantId: true },
      })
    : [];

  const usersByEmail = await prisma.user.findMany({
    where: { email: { equals: emailNorm, mode: 'insensitive' } },
    select: { id: true, email: true, tenantId: true, appAccountId: true },
  });

  const idSet = new Map();
  for (const u of usersByAccount) idSet.set(u.id, u);
  for (const u of usersByEmail) idSet.set(u.id, u);
  const userIds = [...idSet.keys()];

  const summary = {
    emailNorm,
    dryRun,
    appAccount: acc,
    userIds,
    users: [...idSet.values()],
  };

  console.log(JSON.stringify({ phase: 'preview', ...summary }, null, 2));

  if (userIds.length === 0 && !acc) {
    console.log('Nada a apagar (sem AppAccount nem User para este e-mail).');
    await prisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log('Dry-run: nenhuma alteração gravada.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    const techRegFilter = {
      OR: [
        { invitedEmail: { equals: emailNorm, mode: 'insensitive' } },
        ...(userIds.length ? [{ createdUserId: { in: userIds } }, { candidateUserId: { in: userIds } }] : []),
      ],
    };

    const techRegs = await tx.technicianRegistrationApplication.findMany({
      where: techRegFilter,
      select: { id: true },
    });
    const techRegIds = techRegs.map((r) => r.id);
    if (techRegIds.length) {
      await tx.technicianRegistrationEvent.deleteMany({
        where: { applicationId: { in: techRegIds } },
      });
      await tx.technicianRegistrationApplication.deleteMany({
        where: { id: { in: techRegIds } },
      });
    }

    if (userIds.length) {
      await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await tx.pushToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }

    if (acc) {
      const remaining = await tx.user.count({ where: { appAccountId: acc.id } });
      if (remaining === 0) {
        await tx.appAccount.delete({ where: { id: acc.id } });
      }
    }

    await tx.userModuleData.deleteMany({
      where: { ownerEmail: { equals: emailNorm, mode: 'insensitive' } },
    });
    await tx.consentRecord.deleteMany({
      where: { ownerEmail: { equals: emailNorm, mode: 'insensitive' } },
    });
    await tx.telemetryEvent.deleteMany({
      where: { ownerEmail: { equals: emailNorm, mode: 'insensitive' } },
    });

    await tx.chatContact.deleteMany({
      where: {
        OR: [
          { requesterId: { equals: emailNorm, mode: 'insensitive' } },
          { addresseeId: { equals: emailNorm, mode: 'insensitive' } },
        ],
      },
    });
    await tx.chatMessage.deleteMany({
      where: { senderId: { equals: emailNorm, mode: 'insensitive' } },
    });
    await tx.chatRoomMember.deleteMany({
      where: { userId: { equals: emailNorm, mode: 'insensitive' } },
    });

    await tx.assetShare.deleteMany({
      where: {
        OR: [
          { ownerEmail: { equals: emailNorm, mode: 'insensitive' } },
          { sharedWithEmail: { equals: emailNorm, mode: 'insensitive' } },
        ],
      },
    });
    await tx.assetOccupancyCalendarFeed.deleteMany({
      where: { ownerEmail: { equals: emailNorm, mode: 'insensitive' } },
    });
  });

  console.log(JSON.stringify({ phase: 'done', emailNorm, deletedUserIds: userIds }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
