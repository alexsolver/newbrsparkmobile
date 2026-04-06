'use strict';

function saoPauloYearMonthFromDate(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const yyyy = parts.find((p) => p.type === 'year').value;
  const mm = parts.find((p) => p.type === 'month').value;
  return { yyyy, mm, periodKey: `${yyyy}-${mm}` };
}

function formatFtOsNumber(yyyy, mm, seq) {
  return `FT-${yyyy}-${mm}-${String(seq).padStart(7, '0')}`;
}

/**
 * Próximo número global FT-AAAA-MM-NNNNNNN (sequência por mês civil em America/Sao_Paulo).
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function allocateNextFtOsNumber(prisma) {
  const { yyyy, mm, periodKey } = saoPauloYearMonthFromDate(new Date());
  return prisma.$transaction(async (tx) => {
    const row = await tx.osSerialCounter.upsert({
      where: { periodKey },
      create: { periodKey, lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
      select: { lastSeq: true },
    });
    return formatFtOsNumber(yyyy, mm, row.lastSeq);
  });
}

module.exports = {
  saoPauloYearMonthFromDate,
  formatFtOsNumber,
  allocateNextFtOsNumber,
};
