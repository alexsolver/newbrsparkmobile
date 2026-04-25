#!/usr/bin/env node
/**
 * Preenche `metadata.fieldTaskContextTenantId` em `ChecklistExecution` (OS/FT) onde falta,
 * a partir de `User.tenantId` do dono (ownerEmail), quando o e-mail resolve exactamente
 * uma org elegível (prestador / gestor / admin). RT (routineTaskNumber não nulo) ignora.
 *
 * Uso (a partir de admin-panel/backend):
 *   node scripts/backfill-field-task-context-tenant.js
 *   node scripts/backfill-field-task-context-tenant.js --apply
 */
'use strict';

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  ...(process.env.NODE_ENV === 'production' ? {} : { override: true }),
});
const prisma = require('../src/db');
const { FIELD_TASK_CONTEXT_TENANT_KEY } = require('../src/lib/fieldTaskExecutionTenantScope');

const FIELD_ROLES = ['PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'];

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.checklistExecution.findMany({
    where: { routineTaskNumber: null },
    select: { id: true, ownerEmail: true, metadata: true },
  });
  let eligible = 0;
  let updated = 0;
  for (const r of rows) {
    const m = r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata) ? { ...r.metadata } : {};
    if (m[FIELD_TASK_CONTEXT_TENANT_KEY]) continue;
    const em = String(r.ownerEmail || '').trim();
    if (!em) continue;
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        email: { equals: em, mode: 'insensitive' },
        role: { in: FIELD_ROLES },
      },
      select: { tenantId: true },
    });
    const tids = [...new Set(users.map((u) => u.tenantId).filter(Boolean))];
    if (tids.length !== 1) continue;
    const tid = tids[0];
    eligible += 1;
    if (apply) {
      m[FIELD_TASK_CONTEXT_TENANT_KEY] = tid;
      await prisma.checklistExecution.update({
        where: { id: r.id },
        data: { metadata: m },
      });
      updated += 1;
    }
  }
  console.log(
    apply
      ? `Concluído. Linhas com um tenant inequívoco: ${eligible}. Atualizadas: ${updated}.`
      : `Modo dry-run. Linhas que seriam preenchidas (um tenant por e-mail): ${eligible}. Corra com --apply para gravar.`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
