'use strict';

const { saoPauloYearMonthFromDate } = require('./ftOsNumber');

function formatRtNumber(yyyy, mm, seq) {
  return `RT-${yyyy}-${mm}-${String(seq).padStart(6, '0')}`;
}

/**
 * Próximo número global RT-AAAA-MM-NNNNNN (6 dígitos), sequência por mês civil em America/Sao_Paulo.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
async function allocateNextRtNumber(prisma) {
  const { yyyy, mm, periodKey } = saoPauloYearMonthFromDate(new Date());
  return prisma.$transaction(async (tx) => {
    const row = await tx.rtSerialCounter.upsert({
      where: { periodKey },
      create: { periodKey, lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
      select: { lastSeq: true },
    });
    return formatRtNumber(yyyy, mm, row.lastSeq);
  });
}

module.exports = {
  formatRtNumber,
  allocateNextRtNumber,
};
