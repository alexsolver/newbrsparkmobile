'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function run() {
  const toRemove = ['FR', 'DE', 'PT', 'MZ', 'AO'];
  const toKeep   = ['BR', 'US', 'ES', 'AR'];

  for (const code of toRemove) {
    const r = await p.localeProfile.findUnique({ where: { countryCode: code } });
    if (r) {
      await p.localeProfile.delete({ where: { id: r.id } });
      console.log('🗑️  Removido:', code, '-', r.name);
    } else {
      console.log('⚠️  Não encontrado (já removido):', code);
    }
  }

  const ar = await p.localeProfile.findUnique({ where: { countryCode: 'AR' } });
  if (!ar) {
    await p.localeProfile.create({ data: {
      countryCode: 'AR', name: 'Argentina', language: 'es-AR',
      currency: 'ARS', currencySymbol: '$', dateFormat: 'DD/MM/YYYY',
      numberFormat: 'PT_STYLE', timezone: 'America/Argentina/Buenos_Aires', isActive: true
    }});
    console.log('✅ Argentina criada');
  } else {
    await p.localeProfile.update({ where: { id: ar.id }, data: { isActive: true } });
    console.log('✅ Argentina já existe - isActive=true');
  }

  const all = await p.localeProfile.findMany({ select: { countryCode: true, name: true, isActive: true }, orderBy: { name: 'asc' } });
  console.log('\nEstado final:');
  all.forEach(r => console.log(` ${r.isActive ? '✅' : '❌'} ${r.countryCode} - ${r.name}`));
  process.exit(0);
}

run()
  .catch(e => { console.error('ERRO:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
