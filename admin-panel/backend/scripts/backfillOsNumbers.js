'use strict';
/**
 * Preenche osNumber (FT-AAAA-MM-NNNNNNN) em execuções antigas e alinha OsSerialCounter.
 * Executar uma vez após a migração: `node scripts/backfillOsNumbers.js` (a partir de admin-panel/backend).
 */
const prisma = require('../src/db');
const { saoPauloYearMonthFromDate, formatFtOsNumber } = require('../src/lib/ftOsNumber');

const FT_RE = /^FT-(\d{4})-(\d{2})-(\d{7})$/;

async function maxSeqByPeriodFromExisting() {
  const rows = await prisma.checklistExecution.findMany({
    where: { osNumber: { not: null } },
    select: { osNumber: true },
  });
  const map = {};
  for (const { osNumber } of rows) {
    const m = FT_RE.exec(osNumber || '');
    if (!m) continue;
    const pk = `${m[1]}-${m[2]}`;
    const n = parseInt(m[3], 10);
    map[pk] = Math.max(map[pk] || 0, n);
  }
  return map;
}

async function main() {
  const withNumber = await prisma.checklistExecution.count({ where: { osNumber: { not: null } } });
  const need = await prisma.checklistExecution.findMany({
    where: { OR: [{ osNumber: null }, { osNumber: '' }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
  });

  console.log(`[backfillOsNumbers] Já com osNumber: ${withNumber} | A preencher: ${need.length}`);

  const seqByPeriod = await maxSeqByPeriodFromExisting();
  const counters = await prisma.osSerialCounter.findMany();
  for (const c of counters) {
    seqByPeriod[c.periodKey] = Math.max(seqByPeriod[c.periodKey] || 0, c.lastSeq || 0);
  }

  for (const row of need) {
    const { yyyy, mm, periodKey } = saoPauloYearMonthFromDate(row.createdAt);
    const next = (seqByPeriod[periodKey] || 0) + 1;
    seqByPeriod[periodKey] = next;
    const osNumber = formatFtOsNumber(yyyy, mm, next);
    await prisma.checklistExecution.update({
      where: { id: row.id },
      data: { osNumber },
    });
  }

  for (const [periodKey, lastSeq] of Object.entries(seqByPeriod)) {
    await prisma.osSerialCounter.upsert({
      where: { periodKey },
      create: { periodKey, lastSeq },
      update: { lastSeq },
    });
  }

  console.log('[backfillOsNumbers] Concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
