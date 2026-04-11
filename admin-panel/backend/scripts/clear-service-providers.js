'use strict';
/** Remove todas as linhas de ServiceProvider (catálogo legado). Diretório = CMS. */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.serviceProvider
  .deleteMany({})
  .then((r) => {
    console.log(`Removidos ${r.count} prestadores (ServiceProvider).`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
