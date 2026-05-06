#!/usr/bin/env node
/**
 * Move todos os User para o tenant com slug "aria".
 * Resolve @@unique([email, tenantId]) com e-mail alternativo em colisão.
 *
 * Uso: node scripts/moveAllUsersToAriaTenant.js
 *      node scripts/moveAllUsersToAriaTenant.js --dry-run
 */
'use strict';

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

function nextUniqueEmail(email, usedLower) {
  const lower = String(email || '').trim().toLowerCase();
  if (!usedLower.has(lower)) return { email: String(email).trim(), changed: false };
  const at = lower.lastIndexOf('@');
  if (at <= 0) {
    const alt = `migrado_${Date.now()}@aria.com`;
    return { email: alt, changed: true };
  }
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  let n = 1;
  let candidate;
  do {
    candidate = `${local}+migrado${n}@${domain}`;
    n += 1;
  } while (usedLower.has(candidate.toLowerCase()));
  return { email: candidate, changed: true };
}

async function main() {
  const target = await prisma.tenant.findFirst({
    where: { slug: 'aria' },
    select: { id: true, name: true, slug: true, email: true },
  });
  if (!target) {
    console.error('Tenant com slug "aria" não encontrado.');
    process.exit(1);
  }
  console.log('Tenant alvo:', target.id, target.name, target.slug, target.email);

  const toMove = await prisma.user.findMany({
    where: { NOT: { tenantId: target.id } },
    select: { id: true, email: true, name: true, tenantId: true },
    orderBy: { email: 'asc' },
  });

  const already = await prisma.user.findMany({
    where: { tenantId: target.id },
    select: { email: true },
  });
  const usedLower = new Set(already.map((u) => u.email.toLowerCase()));

  console.log(`Utilizadores a mover: ${toMove.length}${dryRun ? ' (dry-run)' : ''}`);

  if (toMove.length === 0) {
    console.log('Nada a fazer — todos já estão no tenant aria.');
    return;
  }

  for (const u of toMove) {
    const { email: newEmail, changed } = nextUniqueEmail(u.email, usedLower);
    usedLower.add(newEmail.toLowerCase());
    const line = `  ${u.email} (${u.name}) tenantId=${u.tenantId.slice(0, 12)}…`;
    if (changed) {
      console.log(line + `  → e-mail ajustado para ${newEmail}`);
    } else {
      console.log(line + '  → tenant apenas');
    }
    if (dryRun) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: { tenantId: target.id, email: newEmail },
    });
  }

  if (dryRun) {
    console.log('\nDry-run: nada foi gravado. Execute sem --dry-run para aplicar.');
  } else {
    console.log('\nConcluído. Recomenda-se «Sincronizar com FaceMatch» nos usuários com fotos faciais.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
