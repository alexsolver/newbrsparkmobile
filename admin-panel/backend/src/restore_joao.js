'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Restaurando dados de João Silva...\n');

  // ── 1. Tenant do João ───────────────────────────────────────────
  const hash = await bcrypt.hash('senha123', 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'joao-silva' },
    update: {},
    create: {
      name: 'João Silva',
      slug: 'joao-silva',
      email: 'joao.silva@aria.com',
      ownerName: 'João',
      phone: '(11) 99999-1234',
      status: 'ACTIVE',
      defaultLang: 'pt-BR',
    }
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ── 2. Usuário João Silva ──────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email_tenantId: { email: 'joao.silva@aria.com', tenantId: tenant.id } },
    update: { password: hash, isActive: true },
    create: {
      name: 'João Silva',
      email: 'joao.silva@aria.com',
      password: hash,
      tenantId: tenant.id,
      role: 'TENANT_ADMIN',
      isActive: true,
    }
  });
  console.log(`✅ Usuário: ${user.email} / senha123`);

  // ── 3. Assinar plano Pro ───────────────────────────────────────
  const pro = await prisma.plan.findFirst({ where: { name: 'Pro' } });
  if (pro) {
    await prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        planId: pro.id,
        status: 'ACTIVE',
        currentStart: new Date(),
        currentEnd: new Date(Date.now() + 365 * 86400000),
      }
    });
    console.log('✅ Assinatura Pro ativa');
  }

  console.log('\n🎉 Restauração concluída!');
  console.log('   Login do App: joao.silva@aria.com / senha123');
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
