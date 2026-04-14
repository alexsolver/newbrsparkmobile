'use strict';
/**
 * Preenche osNumber (FT-AAAA-MM-NNNNNNN) em execuções antigas e alinha OsSerialCounter.
 * `npm run backfill:os-numbers` (a partir de admin-panel/backend).
 */
const prisma = require('../src/db');
const { runBackfillOsNumbers } = require('../src/lib/backfillOsNumbersLib');

runBackfillOsNumbers(prisma)
  .then((r) => {
    if (r.skipped) console.log('[backfillOsNumbers] Nada pendente — todas as OS já têm osNumber.');
    else console.log(`[backfillOsNumbers] Concluído. Atualizadas: ${r.updated} (já numeradas: ${r.alreadyHad}).`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
