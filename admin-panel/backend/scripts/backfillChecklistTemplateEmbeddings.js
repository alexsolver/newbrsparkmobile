#!/usr/bin/env node
'use strict';

/**
 * Gera embeddings para modelos de checklist ativos (Composer — RAG semântico).
 * Uso: node scripts/backfillChecklistTemplateEmbeddings.js [--limit=200]
 */

const prisma = require('../src/db');
const { syncChecklistTemplateEmbedding } = require('../src/lib/formAiChecklistTemplateEmbed');

function parseLimit() {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  if (!arg) return 200;
  const n = parseInt(String(arg.split('=')[1] || '200'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(2000, n) : 200;
}

async function main() {
  const limit = parseLimit();
  const rows = await prisma.checklistTemplate.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, title: true },
  });

  console.log(`A indexar ${rows.length} modelo(s)…`);
  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    const res = await syncChecklistTemplateEmbedding(r.id);
    if (res.ok && !res.skipped) ok++;
    else if (res.ok && res.skipped === 'unchanged') ok++;
    else {
      fail++;
      console.warn(`  [${r.id}] ${r.title || ''} →`, res.skipped || res.error || 'fail');
    }
  }
  console.log(`Concluído. OK/inalterados: ${ok}, falhas/aviso: ${fail}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
