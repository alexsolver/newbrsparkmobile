'use strict';

/**
 * Remove utilizadores pelo e-mail (todos os tenants) e tokens push associados.
 * Uso: node scripts/deleteUsersByEmail.js email1@x.com "outro@y.com"
 * Ex.: node scripts/deleteUsersByEmail.js well@well.com marcio@1.com
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const raw = process.argv.slice(2).filter(Boolean);
  const emails = raw.map((e) => String(e).trim()).filter(Boolean);
  if (!emails.length) {
    console.error('Indique pelo menos um e-mail.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' } })) },
      select: { id: true, email: true, tenantId: true, name: true },
    });

    if (!users.length) {
      console.log('Nenhum utilizador encontrado para:', emails.join(', '));
      return;
    }

    console.log('Encontrados:', users.length);
    for (const u of users) {
      console.log(`  - ${u.email} (${u.name}) tenant=${u.tenantId} id=${u.id}`);
    }

    const ids = users.map((u) => u.id);
    const delTok = await prisma.pushToken.deleteMany({ where: { userId: { in: ids } } });
    console.log(`PushToken removidos: ${delTok.count}`);

    const delU = await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`User removidos: ${delU.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
