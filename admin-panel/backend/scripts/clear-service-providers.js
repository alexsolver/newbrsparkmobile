'use strict';
/**
 * Remove todo o catálogo em PostgreSQL (modelo ServiceProvider).
 *
 * Essas linhas NÃO existem no CMS web (Laravel): só aparecem no app quando
 * DIRECTORY_POSTGRES_FALLBACK=1 ou quando o CMS falha e o fallback está ligado.
 * Com CMS_DIRECTORY_BASE_URL ativo e sem fallback, o app já ignora esta tabela.
 *
 * Uso: node scripts/clear-service-providers.js
 *     npm run directory:clear-legacy
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.serviceProvider
  .deleteMany({})
  .then((r) => {
    console.log(
      `Removidos ${r.count} registro(s) em ServiceProvider (catálogo legado fora do CMS web).`,
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
