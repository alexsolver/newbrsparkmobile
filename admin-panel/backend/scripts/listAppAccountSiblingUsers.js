#!/usr/bin/env node
'use strict';

/**
 * Lista todas as linhas `User` ligadas ao mesmo `AppAccount` (login global).
 * Não apaga nada — «duplicados» aqui são filiações por tenant (modelo intencional).
 *
 * Uso (na pasta admin-panel/backend, com .env com DATABASE_URL):
 *   node scripts/listAppAccountSiblingUsers.js alexsolver@gmail.com
 *   node scripts/listAppAccountSiblingUsers.js --user-id cmog7zmdw000343c6f0qgiabp
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
  const arg = process.argv[2];
  const uidArg = process.argv.includes('--user-id') ? process.argv[process.argv.indexOf('--user-id') + 1] : null;
  if (!arg && !uidArg) {
    console.error(
      'Uso:\n  node scripts/listAppAccountSiblingUsers.js <email>\n  node scripts/listAppAccountSiblingUsers.js --user-id <cuid>',
    );
    process.exit(1);
  }

  let appAccountId = null;
  let label = '';

  if (uidArg) {
    const u = await prisma.user.findUnique({
      where: { id: String(uidArg).trim() },
      select: { id: true, appAccountId: true, email: true, tenantId: true },
    });
    if (!u) {
      console.error('User id não encontrado:', uidArg);
      process.exit(1);
    }
    appAccountId = u.appAccountId;
    label = `user-id=${u.id}`;
    if (!appAccountId) {
      console.log(JSON.stringify({ note: 'User sem appAccountId (legado).', user: u }, null, 2));
      await prisma.$disconnect();
      return;
    }
  } else {
    const emailNorm = normEmail(arg);
    const acc = await prisma.appAccount.findUnique({
      where: { emailNorm },
      select: { id: true, emailNorm: true },
    });
    if (!acc) {
      console.error('AppAccount não encontrado para emailNorm:', emailNorm);
      process.exit(1);
    }
    appAccountId = acc.id;
    label = `emailNorm=${acc.emailNorm}`;
  }

  const rows = await prisma.user.findMany({
    where: { appAccountId: String(appAccountId) },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      tenantId: true,
      role: true,
      isActive: true,
      workTimeTrackingEnabled: true,
      createdAt: true,
      tenant: { select: { name: true, kind: true } },
    },
  });

  console.log(`\nAppAccount ${label} → appAccountId=${appAccountId}\nLinhas User: ${rows.length}\n`);
  for (const r of rows) {
    console.log(
      JSON.stringify(
        {
          id: r.id,
          email: r.email,
          tenantId: r.tenantId,
          tenantName: r.tenant?.name,
          tenantKind: r.tenant?.kind,
          role: r.role,
          isActive: r.isActive,
          workTimeTrackingEnabled: r.workTimeTrackingEnabled,
          createdAt: r.createdAt,
        },
        null,
        2,
      ),
    );
    console.log('---');
  }

  if (rows.length > 1) {
    console.log(
      '\nNota: várias linhas são normais (uma por tenant / filiação). Apagar uma remove essa filiação e dados associados — não é «limpeza de duplicado» segura sem migração.\n',
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
