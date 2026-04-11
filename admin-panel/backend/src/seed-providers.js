'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

/** Diretório oficial = Laravel (CMS). Não repovoar demo em ServiceProvider. */
const providers = [];

async function main() {
  await p.serviceProvider.deleteMany({});
  console.log('🗑️  ServiceProvider: todos os registos removidos (catálogo = CMS).');

  if (!providers.length) {
    console.log('   Nada a inserir.');
    return;
  }

  console.log(`🌱 Seeding ${providers.length} prestadores de serviço...\n`);
  let count = 0;
  for (const prov of providers) {
    const { tags, ...rest } = prov;
    await p.serviceProvider.upsert({
      where: { id: prov.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 50) },
      update: { rating: prov.rating, reviews: prov.reviews },
      create: {
        id: prov.name.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 50),
        ...rest,
        tags: tags || [],
        isActive: true,
      },
    });
    count++;
    if (count % 10 === 0) process.stdout.write(`  ${count}/${providers.length}...\r`);
  }
  console.log(`\n✅ ${count} prestadores criados/atualizados no PostgreSQL.`);
}

main().catch(err => { console.error('❌', err); process.exit(1); }).finally(() => p.$disconnect());
