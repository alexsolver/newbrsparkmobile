'use strict';

const { saoPauloYearMonthFromDate, formatFtOsNumber } = require('./ftOsNumber');

const FT_RE = /^FT-(\d{4})-(\d{2})-(\d{7})$/;

async function maxSeqByPeriodFromExisting(prisma) {
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

/**
 * Preenche osNumber FT-AAAA-MM-NNNNNNN onde falta e alinha OsSerialCounter.
 * Idempotente: se nada em falta, só faz contagens leves.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function runBackfillOsNumbers(prisma) {
  const missing = await prisma.checklistExecution.count({
    where: { OR: [{ osNumber: null }, { osNumber: '' }] },
  });
  if (missing === 0) {
    return { updated: 0, skipped: true };
  }

  const withNumber = await prisma.checklistExecution.count({ where: { osNumber: { not: null } } });
  const need = await prisma.checklistExecution.findMany({
    where: { OR: [{ osNumber: null }, { osNumber: '' }] },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
  });

  const seqByPeriod = await maxSeqByPeriodFromExisting(prisma);
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

  return { updated: need.length, skipped: false, alreadyHad: withNumber };
}

module.exports = { runBackfillOsNumbers };
