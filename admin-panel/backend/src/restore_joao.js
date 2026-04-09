'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Restaurando dados de João Silva e Prestadores...\n');

  // ── 1. Tenant do João ───────────────────────────────────────────
  const hash = await bcrypt.hash('senha123', 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'joao-silva' },
    update: {},
    create: {
      name: 'João Silva',
      slug: 'joao-silva',
      email: 'joao.silva@brspark.com',
      ownerName: 'João',
      phone: '(11) 99999-1234',
      status: 'ACTIVE',
      defaultLang: 'pt-BR',
    }
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ── 2. Usuário João Silva ──────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email_tenantId: { email: 'joao.silva@brspark.com', tenantId: tenant.id } },
    update: { password: hash, isActive: true },
    create: {
      name: 'João Silva',
      email: 'joao.silva@brspark.com',
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

  // ── 4. Prestadores de Serviço ──────────────────────────────────
  const providers = [
    { name: 'Carlos Eletricista', category: 'Elétrica', rating: 4.8, reviews: 127, phone: '(11) 98000-1111', city: 'São Paulo', verified: true, tags: JSON.stringify(['Rápido','Pontual','Instalação']), keywords: 'eletrica instalacao quadro tomada luz' },
    { name: 'Hidro Fix Encanamentos', category: 'Hidráulica', rating: 4.6, reviews: 89, phone: '(11) 97000-2222', city: 'São Paulo', verified: true, tags: JSON.stringify(['Vazamento','Registro','Urgência']), keywords: 'hidraulica encanamento cano vazamento' },
    { name: 'Spick & Span Limpeza', category: 'Limpeza', rating: 4.9, reviews: 214, phone: '(11) 95000-3333', city: 'Campinas', verified: true, tags: JSON.stringify(['Residencial','Pós Obra','Periódica']), keywords: 'limpeza faxina residencial comercial' },
    { name: 'ReformaMax', category: 'Reformas', rating: 4.5, reviews: 62, phone: '(11) 96000-4444', city: 'São Paulo', verified: false, tags: JSON.stringify(['Alvenaria','Pintura','Acabamento']), keywords: 'reforma alvenaria construção acabamento' },
    { name: 'Verde Jardins', category: 'Jardinagem', rating: 4.7, reviews: 43, phone: '(11) 94000-5555', city: 'Guarulhos', verified: true, tags: JSON.stringify(['Poda','Paisagismo','Manutenção']), keywords: 'jardinagem poda paisagismo jardim grama' },
    { name: 'SecureHome', category: 'Segurança', rating: 4.4, reviews: 31, phone: '(11) 93000-6666', city: 'São Paulo', verified: true, tags: JSON.stringify(['Câmeras','Alarme','24h']), keywords: 'segurança cameras alarme ccgv monitoramento' },
    { name: 'ClimaTech SP', category: 'Climatização', rating: 4.6, reviews: 78, phone: '(11) 92000-7777', city: 'São Paulo', verified: true, tags: JSON.stringify(['Ar Condicionado','Manutenção','Instalação']), keywords: 'ar condicionado split inverter instalacao manutencao' },
    { name: 'TechSupport Brasil', category: 'Tecnologia', rating: 4.7, reviews: 55, phone: '(11) 91000-8888', city: 'São Paulo', verified: false, tags: JSON.stringify(['Redes','Computadores','CFTV']), keywords: 'tecnologia rede wifi computador notebook' },
    { name: 'Dedetizadora Alpha', category: 'Dedetização', rating: 4.3, reviews: 29, phone: '(11) 90000-9999', city: 'Santo André', verified: true, tags: JSON.stringify(['Cupim','Baratas','Ratos']), keywords: 'dedetizacao cupim rato barata formiga' },
    { name: 'Mudança Fácil SP', category: 'Mudança', rating: 4.5, reviews: 91, phone: '(11) 89000-0000', city: 'São Paulo', verified: true, tags: JSON.stringify(['Residencial','Comercial','Caminhão']), keywords: 'mudanca transporte caminhao embalar desmontar' },
    { name: 'Gastech Instalações', category: 'Gás', rating: 4.8, reviews: 37, phone: '(11) 88000-1112', city: 'São Paulo', verified: true, tags: JSON.stringify(['Vazamento','Instalação','Botijão']), keywords: 'gas gasoducto instalacao vazamento encanamento' },
    { name: 'Pintor Pro SP', category: 'Pintura', rating: 4.6, reviews: 82, phone: '(11) 87000-2223', city: 'São Paulo', verified: true, tags: JSON.stringify(['Interna','Externa','Textura']), keywords: 'pintura tinta parede textura interna externa' },
    { name: 'Eletro Rápido 24h', category: 'Elétrica', rating: 4.4, reviews: 48, phone: '(11) 86000-3334', city: 'Osasco', verified: false, tags: JSON.stringify(['Emergência','24 Horas','Industrial']), keywords: 'eletrica emergencia 24h industrial residencial' },
    { name: 'AquaPro Hidráulica', category: 'Hidráulica', rating: 4.2, reviews: 22, phone: '(11) 85000-4445', city: 'Guarulhos', verified: false, tags: JSON.stringify(['Desentupimento','Fossa','Bomba']), keywords: 'hidraulica desentupimento fossa bomba agua' },
    { name: 'CleanSpace', category: 'Limpeza', rating: 4.8, reviews: 163, phone: '(11) 84000-5556', city: 'São Paulo', verified: true, tags: JSON.stringify(['Empresa','Condomínio','Hospitalar']), keywords: 'limpeza predial condominio comercial empresa' },
  ];

  let count = 0;
  for (const p of providers) {
    const existing = await prisma.serviceProvider.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.serviceProvider.create({ data: p });
      count++;
    }
  }
  console.log(`✅ ${count} Prestadores criados (${providers.length - count} já existiam)`);

  console.log('\n🎉 Restauração concluída!');
  console.log('   Login do App: joao.silva@brspark.com / senha123');
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
