'use strict';
/**
 * Legado: antes criava prestadores demo no PostgreSQL.
 * O diretório do app vem do Laravel; este script só limpa ServiceProvider.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const n = await p.serviceProvider.deleteMany({});
  console.log(`🗑️  ServiceProvider: removidos ${n.count} registos (diretório = CMS).`);
  process.exit(0);
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
