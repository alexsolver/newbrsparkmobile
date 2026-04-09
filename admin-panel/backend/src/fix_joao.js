'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function run() {
  const email = 'joao@teste.com';
  const password = 'teste123';

  // Check existing user
  const u = await p.user.findFirst({ where: { email }, include: { tenant: true } });
  if (!u) {
    console.log('Usuário não encontrado, criando...');
    // create tenant
    const tenant = await p.tenant.upsert({
      where: { slug: 'joao-teste' },
      update: { status: 'ACTIVE' },
      create: { name: 'João Teste', slug: 'joao-teste', email, ownerName: 'João', status: 'ACTIVE', defaultLang: 'pt-BR' }
    });
    const hash = await bcrypt.hash(password, 10);
    await p.user.create({ data: { name: 'João Teste', email, password: hash, tenantId: tenant.id, role: 'TENANT_ADMIN', isActive: true } });
    console.log('✅ Criado');
  } else {
    const hash = await bcrypt.hash(password, 10);
    await p.user.update({ where: { id: u.id }, data: { password: hash, isActive: true } });
    if (u.tenant) await p.tenant.update({ where: { id: u.tenantId }, data: { status: 'ACTIVE' } });
    console.log('User:', u.email, '| tenant status:', u.tenant?.status, '| isActive:', u.isActive);
    console.log('✅ Senha atualizada para teste123');
  }

  // Confirm
  const check = await p.user.findFirst({ where: { email }, include: { tenant: true } });
  const valid = await bcrypt.compare(password, check.password);
  console.log('bcrypt verify:', valid, '| tenant:', check.tenant?.status, '| isActive:', check.isActive);
  process.exit(0);
}

run()
  .catch(e => { console.error('ERRO:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
