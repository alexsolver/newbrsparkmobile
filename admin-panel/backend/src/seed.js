'use strict';
/**
 * Seed script — populates the database with initial data.
 * Run: node src/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt  = require('bcryptjs');
const prisma  = require('./db');
const { normalizeOsrmBaseUrl } = require('./lib/osrmBaseUrl');

async function main() {
  console.log('🌱 Seeding BrSpark Admin database...\n');

  // Admin
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@brspark.com';
  const adminHash  = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
  await prisma.admin.upsert({
    where:  { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: 'BrSpark Admin', password: adminHash },
  });
  console.log(`✅ Admin: ${adminEmail}`);


  // ── Plans ──────────────────────────────────────────────
  const plans = await Promise.all([
    prisma.plan.upsert({ where: { name: 'Basic' }, update: {}, create: {
      name: 'Basic', priceMonthly: 99, priceYearly: 990, maxAssets: 50, maxUsers: 5, storageGb: 5,
      features: { stock: true, vault: false, ai: false, documents: true, insurance: false, facialVisionProvider: 'COMPREFACE' }
    }}),
    prisma.plan.upsert({ where: { name: 'Pro' }, update: {}, create: {
      name: 'Pro', priceMonthly: 399, priceYearly: 3990, maxAssets: 500, maxUsers: 20, storageGb: 50,
      features: { stock: true, vault: true, ai: true, documents: true, insurance: true, facialVisionProvider: 'COMPREFACE' }
    }}),
    prisma.plan.upsert({ where: { name: 'Enterprise' }, update: {}, create: {
      name: 'Enterprise', priceMonthly: 2400, priceYearly: 24000, maxAssets: -1, maxUsers: -1, storageGb: 500,
      features: { stock: true, vault: true, ai: true, documents: true, insurance: true, reports: true, realtime: true, facialVisionProvider: 'COMPREFACE' }
    }}),
  ]);
  console.log(`✅ Plans: ${plans.map(p => p.name).join(', ')}`);

  // ── Locale + tenants + usuários demo (painel com listas preenchidas) ───────
  const locBr = await prisma.localeProfile.upsert({
    where: { countryCode: 'BR' },
    update: {},
    create: {
      countryCode: 'BR',
      name: 'Brasil',
      language: 'pt-BR',
      currency: 'BRL',
      currencySymbol: 'R$',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: 'PT_STYLE',
      timezone: 'America/Sao_Paulo',
      taxIdLabel: 'CPF',
      postalCodeLabel: 'CEP',
      measureSystem: 'METRIC',
    },
  });
  const locUs = await prisma.localeProfile.upsert({
    where: { countryCode: 'US' },
    update: {},
    create: {
      countryCode: 'US',
      name: 'United States',
      language: 'en-US',
      currency: 'USD',
      currencySymbol: '$',
      dateFormat: 'MM/DD/YYYY',
      numberFormat: 'US_STYLE',
      timezone: 'America/New_York',
      taxIdLabel: 'Tax ID',
      postalCodeLabel: 'ZIP',
      measureSystem: 'IMPERIAL',
    },
  });

  const adminRow = await prisma.admin.findUnique({ where: { email: adminEmail } });
  const basicPlan = plans.find((p) => p.name === 'Basic');
  const proPlan = plans.find((p) => p.name === 'Pro');

  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  // Tenant padrão do app móvel (APP_DEFAULT_TENANT_SLUG=brspark-app) — usuários com role USER
  const tenantBrsparkApp = await prisma.tenant.upsert({
    where: { slug: 'brspark-app' },
    update: { localeId: locBr.id, status: 'ACTIVE' },
    create: {
      name: 'BrSpark App',
      slug: 'brspark-app',
      email: 'app-conta@brspark.internal',
      ownerName: 'BrSpark',
      localeId: locBr.id,
      status: 'ACTIVE',
      defaultLang: 'pt-BR',
    },
  });
  if (basicPlan) {
    await prisma.subscription.upsert({
      where: { tenantId: tenantBrsparkApp.id },
      update: {},
      create: {
        tenantId: tenantBrsparkApp.id,
        planId: basicPlan.id,
        billingCycle: 'MONTHLY',
        status: 'ACTIVE',
        currentStart: now,
        currentEnd: nextMonth,
      },
    });
  }
  console.log(`✅ Tenant app padrão: ${tenantBrsparkApp.name} (slug brspark-app) — use APP_DEFAULT_TENANT_SLUG=brspark-app no .env`);

  const tenantDemo = await prisma.tenant.upsert({
    where: { email: 'conta-demo@brspark.com' },
    update: { localeId: locBr.id, status: 'ACTIVE' },
    create: {
      name: 'Conta Demonstração',
      slug: 'conta-demonstracao',
      email: 'conta-demo@brspark.com',
      ownerName: 'Maria Souza',
      phone: '+5511987654321',
      localeId: locBr.id,
      status: 'ACTIVE',
      defaultLang: 'pt-BR',
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenantDemo.id },
    update: {},
    create: {
      tenantId: tenantDemo.id,
      planId: proPlan.id,
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
      currentStart: now,
      currentEnd: nextMonth,
    },
  });

  const demoUserHash = await bcrypt.hash('demo123', 10);
  await prisma.user.upsert({
    where: { email_tenantId: { email: 'maria@brspark.com', tenantId: tenantDemo.id } },
    update: {},
    create: {
      tenantId: tenantDemo.id,
      email: 'maria@brspark.com',
      name: 'Maria Souza',
      password: demoUserHash,
      role: 'TENANT_ADMIN',
      isActive: true,
      lastLogin: now,
    },
  });

  // Tenant BrSpark (SaaS admin — login por organização no painel)
  try {
    /** Utilizadores `User` do tenant org `brspark` (app). Não reutiliza `ADMIN_PASSWORD` (é só da tabela `Admin`). */
    const saasPwd = process.env.SAAS_PANEL_PASSWORD || '123456';
    const saasHash = await bcrypt.hash(saasPwd, 10);
    const brsparkTenant = await prisma.tenant.upsert({
      where: { slug: 'brspark' },
      update: { name: 'BrSpark', status: 'ACTIVE', localeId: locBr.id },
      create: {
        name: 'BrSpark',
        slug: 'brspark',
        email: 'platform@brspark.com',
        ownerName: 'BrSpark Plataforma',
        localeId: locBr.id,
        status: 'ACTIVE',
        defaultLang: 'pt-BR',
      },
    });
    await prisma.user.upsert({
      where: {
        email_tenantId: {
          email: 'admin@brspark.com',
          tenantId: brsparkTenant.id,
        },
      },
      update: {
        role: 'SAAS_ADMIN',
        isActive: true,
        name: 'Administrador SaaS',
        password: saasHash,
      },
      create: {
        tenantId: brsparkTenant.id,
        email: 'admin@brspark.com',
        name: 'Administrador SaaS',
        password: saasHash,
        role: 'SAAS_ADMIN',
        isActive: true,
      },
    });
    await prisma.user.upsert({
      where: {
        email_tenantId: {
          email: 'gestor@brspark.com',
          tenantId: brsparkTenant.id,
        },
      },
      update: { role: 'MANAGER', isActive: true, name: 'Gestor (demo)', password: saasHash },
      create: {
        tenantId: brsparkTenant.id,
        email: 'gestor@brspark.com',
        name: 'Gestor (demo)',
        password: saasHash,
        role: 'MANAGER',
        isActive: true,
      },
    });
    // Prestador demo: despacho exige User ativo + TechnicianProfile.status ACTIVE (não basta isActive).
    const alexTech = await prisma.user.upsert({
      where: {
        email_tenantId: {
          email: 'alex@brspark.com',
          tenantId: brsparkTenant.id,
        },
      },
      update: {
        isActive: true,
        role: 'PROVIDER',
        name: 'Alex (técnico demo)',
        password: saasHash,
      },
      create: {
        tenantId: brsparkTenant.id,
        email: 'alex@brspark.com',
        name: 'Alex (técnico demo)',
        password: saasHash,
        role: 'PROVIDER',
        isActive: true,
      },
    });
    await prisma.technicianProfile.upsert({
      where: { userId: alexTech.id },
      update: { status: 'ACTIVE' },
      create: { userId: alexTech.id, status: 'ACTIVE', score: 5 },
    });
    const removedTypo = await prisma.user.deleteMany({
      where: { tenantId: brsparkTenant.id, email: 'asmin@brspark.com' },
    });
    if (removedTypo.count) {
      console.log(
        `   Removido usuário legado asmin@brspark.com (${removedTypo.count})`
      );
    }
    console.log(
      `✅ Tenant brspark + admin + gestor + alex@brspark.com (PROVIDER, perfil ACTIVE; senha User tenant = SAAS_PANEL_PASSWORD ou "123456")`
    );
  } catch (e) {
    console.warn('⚠️  Seed tenant brspark:', e.message);
  }

  const tenantTrial = await prisma.tenant.upsert({
    where: { email: 'trial@startup.io' },
    update: { localeId: locUs.id },
    create: {
      name: 'Startup Trial',
      slug: 'startup-trial',
      email: 'trial@startup.io',
      ownerName: 'Alex Founder',
      localeId: locUs.id,
      status: 'TRIAL',
      defaultLang: 'en-US',
    },
  });

  await prisma.subscription.upsert({
    where: { tenantId: tenantTrial.id },
    update: {},
    create: {
      tenantId: tenantTrial.id,
      planId: basicPlan.id,
      billingCycle: 'MONTHLY',
      status: 'TRIALING',
      currentStart: now,
      currentEnd: nextMonth,
      trialEndsAt: nextMonth,
    },
  });

  await prisma.user.upsert({
    where: { email_tenantId: { email: 'alex@startup.io', tenantId: tenantTrial.id } },
    update: {},
    create: {
      tenantId: tenantTrial.id,
      email: 'alex@startup.io',
      name: 'Alex Founder',
      password: demoUserHash,
      role: 'TENANT_ADMIN',
      isActive: true,
    },
  });

  let assetDemo = await prisma.asset.findFirst({
    where: { tenantId: tenantDemo.id, title: 'Apartamento Paulista' },
  });
  if (!assetDemo) {
    assetDemo = await prisma.asset.create({
      data: {
        tenantId: tenantDemo.id,
        title: 'Apartamento Paulista',
        type: 'REAL_ESTATE',
        status: 'Operacional',
        description: 'Imóvel residencial — dados de demonstração do seed',
        imageUrl: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80',
      },
    });
  }

  const stockSku = 'DEMO-FILTRO-001';
  const existingStock = await prisma.stockItem.findFirst({
    where: { assetId: assetDemo.id, sku: stockSku },
  });
  if (!existingStock) {
    await prisma.stockItem.create({
      data: {
        assetId: assetDemo.id,
        name: 'Filtro de ar condicionado',
        sku: stockSku,
        currentStock: 1,
        minStock: 5,
        unit: 'un',
      },
    });
  }

  const auditCount = await prisma.auditLog.count();
  if (auditCount < 2 && adminRow) {
    await prisma.auditLog.createMany({
      data: [
        {
          adminId: adminRow.id,
          action: 'SEED_DEMO',
          resource: 'PostgreSQL',
          category: 'SYSTEM',
          metadata: { note: 'Dados de demonstração inseridos pelo seed' },
        },
        {
          tenantId: tenantDemo.id,
          adminId: adminRow.id,
          action: 'TENANT_REVIEW',
          resource: tenantDemo.name,
          category: 'ADMIN',
        },
      ],
    });
  }
  console.log('✅ Demo: 2 tenants, assinaturas, usuários, 1 bem, estoque crítico de exemplo, auditoria');

  // ── Feature Flags ──────────────────────────────────────
  const flags = [
    { key: 'stock',     label: 'Módulo de Estoque',    description: 'Gestão de almoxarifado e movimentações',  icon: 'cube-outline', enabled: true },
    { key: 'insurance', label: 'Módulo de Seguros',    description: 'Apólices e cobertura de bens',            icon: 'shield-checkmark-outline', enabled: true },
    { key: 'vault',     label: 'Cofre (Vault)',         description: 'Armazenamento de credenciais seguras',    icon: 'lock-closed-outline', enabled: true },
    { key: 'ai',        label: 'Consultor AI',          description: 'Assistente inteligente por bem',          icon: 'sparkles-outline', enabled: true },
    { key: 'documents', label: 'Módulo de Documentos', description: 'Upload e gestão de arquivos por bem',     icon: 'document-text-outline', enabled: true },
    { key: 'reports',   label: 'Relatórios Avançados', description: 'Exportação CSV e análise de custos',      icon: 'stats-chart-outline', enabled: false },
    { key: 'realtime',  label: 'Sync em Tempo Real',   description: 'Sincronização cloud em tempo real',       icon: 'sync-outline', enabled: false },
    { key: 'i18n',      label: 'Multi-idioma',          description: 'Suporte a EN, ES e PT-BR',                icon: 'globe-outline', enabled: true },
    {
      key: 'work_time',
      label: 'Registro de horas (ponto)',
      description: 'Módulo de batidas com face e localização no app do técnico',
      icon: 'finger-print-outline',
      enabled: true,
    },
    {
      key: 'provider_first_network',
      label: 'Rede de prestadores (provider-first)',
      description: 'Onboarding global de prestador + parcerias por tenant (rollout gradual)',
      icon: 'people-circle-outline',
      enabled: false,
    },
  ];
  for (const flag of flags) {
    const existing = await prisma.featureFlag.findFirst({ where: { key: flag.key, tenantId: null } });
    if (!existing) {
      await prisma.featureFlag.create({ data: { ...flag, tenantId: null } });
    } else {
      await prisma.featureFlag.update({ where: { id: existing.id }, data: { icon: flag.icon } });
    }
  }
  console.log(`✅ Feature flags: ${flags.length} flags seeded/updated`);

  // ── Metatags ───────────────────────────────────────────
  // Asset Types & Status (Patterns from App)
  const metatags = [
    { type: 'ASSET_TYPE',       key: 'real_estate',   ptBr: 'Imóvel',           enUs: 'Real Estate',    esEs: 'Inmueble',         icon: 'home-outline', color: '#3B82F6' },
    { type: 'ASSET_TYPE',       key: 'terrestrial',   ptBr: 'Veículo',          enUs: 'Vehicle',        esEs: 'Vehículo',         icon: 'car-outline', color: '#F97316' },
    { type: 'ASSET_TYPE',       key: 'aquatic',       ptBr: 'Embarcação',       enUs: 'Vessel',         esEs: 'Embarcación',      icon: 'boat-outline', color: '#06B6D4' },
    { type: 'ASSET_TYPE',       key: 'special',       ptBr: 'Equipamento',      enUs: 'Equipment',      esEs: 'Equipamiento',     icon: 'construct-outline', color: '#8B5CF6' },
    
    { type: 'ASSET_STATUS',     key: 'operational',   ptBr: 'Operacional',      enUs: 'Operational',    esEs: 'Operacional',      icon: 'ellipse-outline', color: '#10B981' },
    { type: 'ASSET_STATUS',     key: 'maintenance',   ptBr: 'Em Manutenção',    enUs: 'In Maintenance', esEs: 'En Mantenimiento', icon: 'ellipse-outline', color: '#F59E0B' },
    { type: 'ASSET_STATUS',     key: 'inactive',      ptBr: 'Inativo',          enUs: 'Inactive',       esEs: 'Inactivo',         icon: 'ellipse-outline', color: '#EF4444' },

    // Service Categories — fallback quando o app não obtém lista do CMS Laravel (CMS_DIRECTORY_BASE_URL no BFF).
    { type: 'SERVICE_CATEGORY', key: 'eletrica',      ptBr: 'Elétrica',         enUs: 'Electrical',     esEs: 'Eléctrica',        icon: 'flash-outline', color: '#F59E0B' },
    { type: 'SERVICE_CATEGORY', key: 'hidraulica',    ptBr: 'Hidráulica',       enUs: 'Hydraulic',      esEs: 'Hidráulica',       icon: 'water-outline', color: '#3B82F6' },
    { type: 'SERVICE_CATEGORY', key: 'limpeza',       ptBr: 'Limpeza',          enUs: 'Cleaning',       esEs: 'Limpieza',         icon: 'sparkles-outline',color: '#10B981' },
    { type: 'SERVICE_CATEGORY', key: 'reformas',      ptBr: 'Reformas',         enUs: 'Renovation',     esEs: 'Reformas',         icon: 'hammer-outline', color: '#8B5CF6' },
    { type: 'SERVICE_CATEGORY', key: 'jardinagem',    ptBr: 'Jardinagem',       enUs: 'Gardening',      esEs: 'Jardinería',       icon: 'leaf-outline', color: '#22C55E' },
    { type: 'SERVICE_CATEGORY', key: 'seguranca',     ptBr: 'Segurança',        enUs: 'Security',       esEs: 'Seguridad',        icon: 'shield-checkmark-outline', color: '#EF4444' },
    { type: 'SERVICE_CATEGORY', key: 'tecnologia',    ptBr: 'Tecnologia',       enUs: 'Technology',     esEs: 'Tecnología',       icon: 'laptop-outline', color: '#6366F1' },
    { type: 'SERVICE_CATEGORY', key: 'mudanca',       ptBr: 'Mudança',          enUs: 'Moving',         esEs: 'Mudanza',          icon: 'cube-outline', color: '#EC4899' },
  ];
  for (const [i, tag] of metatags.entries()) {
    await prisma.metatag.upsert({ 
      where: { key: tag.key }, 
      update: { icon: tag.icon, color: tag.color }, 
      create: { ...tag, sortOrder: i } 
    });
  }

  const techExpenseCats = [
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'combustivel', ptBr: 'Combustível', enUs: 'Fuel', esEs: 'Combustible', icon: 'flash-outline', color: '#EA580C' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'estacionamento', ptBr: 'Estacionamento', enUs: 'Parking', esEs: 'Estacionamiento', icon: 'business-outline', color: '#64748B' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'pedagio', ptBr: 'Pedágio / pedágios', enUs: 'Tolls', esEs: 'Peajes', icon: 'ticket-outline', color: '#7C3AED' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'transporte_publico_taxi_app', ptBr: 'Transporte público / táxi / app', enUs: 'Public transit / taxi / ride-hail', esEs: 'Transporte / taxi / app', icon: 'bus-outline', color: '#2563EB' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'materiais_consumiveis', ptBr: 'Materiais / consumíveis', enUs: 'Materials / consumables', esEs: 'Materiales / consumibles', icon: 'cube-outline', color: '#0D9488' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'pecas_antecipadas', ptBr: 'Peças antecipadas', enUs: 'Advance parts purchase', esEs: 'Piezas anticipadas', icon: 'hardware-chip-outline', color: '#0891B2' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'servicos_terceiros_obra', ptBr: 'Serviços de terceiros na obra', enUs: 'Third-party services on site', esEs: 'Servicios de terceros en obra', icon: 'people-outline', color: '#4F46E5' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'alimentacao', ptBr: 'Refeição / alimentação', enUs: 'Meals', esEs: 'Comidas', icon: 'restaurant-outline', color: '#D97706' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'hospedagem', ptBr: 'Hospedagem', enUs: 'Lodging', esEs: 'Hospedaje', icon: 'bed-outline', color: '#9333EA' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'ferramentas_equipamento', ptBr: 'Ferramentas / equipamento', enUs: 'Tools / equipment', esEs: 'Herramientas / equipo', icon: 'construct-outline', color: '#475569' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'epi', ptBr: 'EPI', enUs: 'PPE', esEs: 'EPP', icon: 'shield-checkmark-outline', color: '#059669' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'taxas_multas', ptBr: 'Taxas / multas', enUs: 'Fees / fines', esEs: 'Tasas / multas', icon: 'warning-outline', color: '#DC2626' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'comunicacao', ptBr: 'Comunicação (dados, SIM)', enUs: 'Communication (data, SIM)', esEs: 'Comunicación (datos, SIM)', icon: 'phone-portrait-outline', color: '#0284C7' },
    { type: 'TECHNICIAN_EXPENSE_CATEGORY', key: 'outros', ptBr: 'Outros', enUs: 'Other', esEs: 'Otros', icon: 'ellipsis-horizontal-outline', color: '#6B7280' },
  ];
  for (const [i, tag] of techExpenseCats.entries()) {
    await prisma.metatag.upsert({
      where: { key: tag.key },
      update: { type: tag.type, icon: tag.icon, color: tag.color, ptBr: tag.ptBr, enUs: tag.enUs, esEs: tag.esEs },
      create: { ...tag, sortOrder: 200 + i },
    });
  }
  console.log(`✅ Metatags: ${metatags.length} base + ${techExpenseCats.length} categorias despesa técnico`);

  // ── Compliance Docs ────────────────────────────────────
  const complianceDocs = [
    {
      id: 'terms-v1',
      type: 'TERMS_OF_USE',
      version: '1.0',
      title: 'Termos de Uso — Plataforma BrSpark',
      content: [
        '# Termos de Uso da Plataforma BrSpark',
        '',
        '**Versão 1.0 — Vigência a partir de 23 de março de 2025**',
        '',
        'Bem-vindo à BrSpark. Ao criar uma conta e utilizar nossos serviços, você concorda com estes Termos de Uso.',
        '',
        '---',
        '',
        '## 1. Aceitação dos Termos',
        '',
        'O acesso e uso da plataforma BrSpark estão condicionados à aceitação e ao cumprimento destes termos.',
        '',
        '## 2. Descrição do Serviço',
        '',
        'A BrSpark é uma plataforma SaaS para gestão de patrimônio pessoal e empresarial, incluindo:',
        '',
        '- **Cadastro e rastreamento de bens**: imóveis, veículos, equipamentos e outros ativos;',
        '- **Gestão de estoque**: controle de entradas, saídas e inventário;',
        '- **Vault de documentos**: armazenamento seguro de arquivos e credenciais;',
        '- **Gestão de seguros**: controle de apólices e coberturas;',
        '- **Consultor AI**: assistente inteligente integrado à conta do usuário.',
        '',
        '## 3. Cadastro e Conta',
        '',
        '3.1. Para utilizar a plataforma, você deve criar uma conta com informações verdadeiras e atualizadas.',
        '',
        '3.2. Você é responsável pela confidencialidade de sua senha e por todas as atividades realizadas em sua conta.',
        '',
        '3.3. Notifique-nos imediatamente em caso de uso não autorizado: **suporte@brspark.com**.',
        '',
        '## 4. Uso Aceitável',
        '',
        'Ao utilizar a plataforma, você concorda em **não**:',
        '',
        '- Cadastrar informações falsas ou fraudulentas;',
        '- Tentar acessar dados de outros usuários;',
        '- Realizar engenharia reversa ou extrair o código-fonte;',
        '- Utilizar a plataforma para fins ilegais;',
        '- Transmitir vírus ou código malicioso.',
        '',
        '## 5. Planos e Pagamentos',
        '',
        '5.1. A plataforma oferece planos pagos (Basic, Pro, Enterprise) e um período de avaliação gratuita.',
        '',
        '5.2. Os valores podem ser alterados mediante aviso prévio de 30 dias.',
        '',
        '5.3. Não há reembolso por períodos parciais utilizados, salvo exigido por lei.',
        '',
        '## 6. Dados e Privacidade',
        '',
        'O tratamento dos seus dados pessoais é regido pela nossa **Política de Privacidade**, em conformidade com a LGPD (Lei nº 13.709/2018) e o GDPR (EU 2016/679).',
        '',
        '## 7. Propriedade Intelectual',
        '',
        'Todo o conteúdo da plataforma BrSpark é de propriedade exclusiva da BrSpark Tecnologia Ltda. Os dados que você cadastra continuam sendo de sua propriedade.',
        '',
        '## 8. Limitação de Responsabilidade',
        '',
        'A responsabilidade total da BrSpark, em qualquer hipótese, é limitada ao valor pago nos últimos 3 meses de assinatura.',
        '',
        '## 9. Rescisão',
        '',
        '9.1. Você pode encerrar sua conta a qualquer momento nas configurações do aplicativo.',
        '',
        '9.2. Após o encerramento, seus dados são retidos por 90 dias e depois excluídos definitivamente.',
        '',
        '## 10. Legislação Aplicável',
        '',
        'Estes Termos são regidos pelas leis do Brasil. Foro: Comarca de São Paulo/SP.',
        '',
        '---',
        '',
        '📧 **Contato**: suporte@brspark.com | 🌐 https://www.brspark.com',
      ].join('\n'),
    },
    {
      id: 'privacy-v1',
      type: 'PRIVACY_POLICY',
      version: '1.0',
      title: 'Política de Privacidade — BrSpark',
      content: [
        '# Política de Privacidade da BrSpark',
        '',
        '**Versão 1.0 — Vigência a partir de 23 de março de 2025**',
        '',
        'A BrSpark Tecnologia Ltda. tem o compromisso de proteger sua privacidade. Esta Política descreve como coletamos, usamos e protegemos seus dados pessoais, em conformidade com a **LGPD (Lei 13.709/2018)** e o **GDPR (EU 2016/679)**.',
        '',
        '## 1. Controlador dos Dados',
        '',
        '**BrSpark Tecnologia Ltda.**',
        'Endereço: São Paulo, SP — Brasil',
        'Encarregado de Dados (DPO): dpo@brspark.com',
        '',
        '## 2. Dados que Coletamos',
        '',
        '### 2.1 Dados fornecidos por você:',
        '- **Dados de cadastro**: nome completo, e-mail, senha (armazenada com hash bcrypt);',
        '- **Dados de bens**: informações sobre seus ativos cadastrados;',
        '- **Documentos**: arquivos armazenados no Vault.',
        '',
        '### 2.2 Dados coletados automaticamente:',
        '- Endereço IP e localização aproximada;',
        '- Tipo de dispositivo e versão do app;',
        '- Logs de acesso para segurança.',
        '',
        '## 3. Finalidades do Tratamento',
        '',
        '| Finalidade | Base Legal (LGPD) |',
        '|---|---|',
        '| Criação e gerenciamento de conta | Execução de contrato |',
        '| Prestação dos serviços | Execução de contrato |',
        '| Segurança e prevenção a fraudes | Interesse legítimo |',
        '| Conformidade LGPD/GDPR | Obrigação legal |',
        '| Notificações push | Consentimento |',
        '',
        '## 4. Compartilhamento de Dados',
        '',
        '**Não vendemos seus dados.** Compartilhamos apenas com provedores de infraestrutura (ex: AWS) e quando exigido por lei.',
        '',
        '## 5. Armazenamento e Segurança',
        '',
        '- Criptografia em trânsito (TLS 1.3) e em repouso (AES-256);',
        '- Senhas armazenadas exclusivamente sob hash bcrypt;',
        '- Incidentes notificados em até **72 horas** conforme exigido por lei.',
        '',
        '## 6. Retenção de Dados',
        '',
        '| Tipo | Prazo |',
        '|---|---|',
        '| Conta ativa | Enquanto durar a conta |',
        '| Conta encerrada | 90 dias após encerramento |',
        '| Logs de acesso | 12 meses |',
        '| Dados fiscais | 5 anos (obrigação legal) |',
        '',
        '## 7. Seus Direitos (LGPD/GDPR)',
        '',
        'Você tem direito a: **acesso, correção, exclusão ("direito ao esquecimento"), portabilidade, oposição e revogação de consentimento**.',
        '',
        'Para exercer esses direitos: **dpo@brspark.com** ou Conta → Privacidade → Gerenciar Meus Dados.',
        '',
        '## 8. Cookies e Armazenamento Local',
        '',
        'O app móvel usa AsyncStorage (no próprio dispositivo) apenas para manter sua sessão. Não utilizamos cookies de rastreamento.',
        '',
        '## 9. Alterações',
        '',
        'Notificaremos sobre mudanças materiais com pelo menos 30 dias de antecedência.',
        '',
        '---',
        '',
        '📧 **DPO**: dpo@brspark.com | 🌐 https://www.brspark.com/privacidade',
      ].join('\n'),
    },
    {
      id: 'lgpd-v1',
      type: 'LGPD_DPA',
      version: '1.0',
      title: 'DPA — Acordo de Processamento de Dados (LGPD)',
      content: [
        '# Acordo de Processamento de Dados (DPA)',
        '',
        '**Conforme a Lei 13.709/2018 — LGPD**',
        '',
        '## 1. Partes',
        '- **Controlador**: O usuário que contrata os serviços da BrSpark.',
        '- **Operador**: BrSpark Tecnologia Ltda.',
        '',
        '## 2. Obrigações do Operador',
        '- Tratar dados apenas conforme instruções documentadas;',
        '- Garantir confidencialidade;',
        '- Notificar incidentes em até 72 horas;',
        '- Excluir dados ao término do contrato.',
        '',
        '## 3. Vigência',
        'Este DPA vigora enquanto durar a relação contratual.',
      ].join('\n'),
    },
  ];

  for (const doc of complianceDocs) {
    await prisma.complianceDoc.upsert({
      where: { id: doc.id },
      update: { content: doc.content, title: doc.title, isActive: true },
      create: { ...doc, isActive: true, publishedAt: new Date(), createdBy: adminEmail },
    });
  }
  console.log(`✅ Compliance docs: ${complianceDocs.length} documentos (ToU + Privacidade + DPA)`);


  // ── Notification Templates ─────────────────────────────
  const templates = [
    { key: 'welcome',        label: 'Boas-vindas',           channel: 'EMAIL', subject: 'Bem-vindo à BrSpark, {{name}}!', body: 'Olá {{name}},\n\nSeu acesso foi criado com sucesso.\n\nE-mail: {{email}}\nSenha temporária: {{password}}\n\nAcesse: {{loginUrl}}' },
    { key: 'stock_low',      label: 'Estoque Crítico',       channel: 'PUSH',  body: '⚠️ {{itemName}} atingiu nível crítico no {{assetName}} ({{currentStock}} {{unit}} restantes)' },
    { key: 'policy_expiring',label: 'Apólice Vencendo',     channel: 'EMAIL', subject: 'Apólice vencendo em {{days}} dias', body: 'Sua apólice {{policyName}} vence em {{dueDate}}.' },
    { key: 'trial_ending',   label: 'Trial Encerrando',     channel: 'EMAIL', subject: 'Seu período trial encerra em {{days}} dias', body: 'Olá {{tenantName}},\n\nSeu trial encerra em {{days}} dias. Escolha um plano para continuar usando.' },
    { key: 'tech_reg_submitted_candidate_push', label: 'Cadastro prestador enviado (candidato/push)', channel: 'PUSH', subject: 'Cadastro enviado', body: 'Recebemos sua candidatura para {{tenantName}}.' },
    { key: 'tech_reg_submitted_candidate_email', label: 'Cadastro prestador enviado (candidato/e-mail)', channel: 'EMAIL', subject: 'BrSpark — candidatura de prestador recebida ({{tenantName}})', body: 'Olá,\n\nRecebemos sua candidatura de prestador para {{tenantName}}. Nossa equipe fará a análise e você será avisado quando houver atualização de status.' },
    { key: 'tech_reg_submitted_reviewer_push', label: 'Novo cadastro prestador (revisor/push)', channel: 'PUSH', subject: 'Nova candidatura de prestador', body: '{{invitedEmail}} enviou candidatura ({{tenantName}}).' },
    { key: 'tech_reg_needs_revision_candidate_push', label: 'Cadastro prestador com ajustes (candidato/push)', channel: 'PUSH', subject: 'Ajustes no cadastro', body: 'A equipe solicitou ajustes na sua candidatura de prestador.' },
    { key: 'tech_reg_needs_revision_candidate_email', label: 'Cadastro prestador com ajustes (candidato/e-mail)', channel: 'EMAIL', subject: 'BrSpark — ajustes solicitados no cadastro de prestador', body: 'Olá,\n\nA equipe solicitou ajustes na sua candidatura de prestador ({{tenantName}}).\n\nMensagem da revisão:\n{{revisionNote}}\n\nAbra o app BrSpark para corrigir e reenviar.' },
    { key: 'tech_reg_approved_candidate_push', label: 'Cadastro prestador aprovado (candidato/push)', channel: 'PUSH', subject: 'Cadastro aprovado', body: 'Seu cadastro de prestador foi aprovado. O modo Prestador já está disponível no app.' },
    { key: 'tech_reg_approved_candidate_email', label: 'Cadastro prestador aprovado (candidato/e-mail)', channel: 'EMAIL', subject: 'BrSpark — cadastro de prestador aprovado', body: 'Olá,\n\nSeu cadastro de prestador foi aprovado para {{tenantName}}.\nVocê já pode usar o modo Prestador no app BrSpark.' },
    { key: 'tech_reg_rejected_candidate_push', label: 'Cadastro prestador não aprovado (candidato/push)', channel: 'PUSH', subject: 'Cadastro não aprovado', body: 'Sua candidatura de prestador foi encerrada sem aprovação.' },
    { key: 'tech_reg_rejected_candidate_email', label: 'Cadastro prestador não aprovado (candidato/e-mail)', channel: 'EMAIL', subject: 'BrSpark — cadastro de prestador não aprovado', body: 'Olá,\n\nSua candidatura de prestador ({{tenantName}}) foi encerrada sem aprovação.\n\nMotivo informado:\n{{reason}}' },
  ];
  for (const t of templates) {
    await prisma.notificationTemplate.upsert({
      where: { key: t.key }, update: {}, create: { ...t, variables: Object.fromEntries((t.body.match(/\{\{(\w+)\}\}/g) || []).map(v => [v.replace(/\{|\}/g, ''), 'string'])) }
    });
  }
  console.log(`✅ Notification templates: ${templates.length} seeded`);

  // ── OSRM (Integrações → Mapas) — override com OSRM_BASE_URL no .env ────────
  const osrmBase = normalizeOsrmBaseUrl(
    process.env.OSRM_BASE_URL || 'http://osrm.lansolver.com:5000'
  );
  const osrmRow = await prisma.integration.findFirst({ where: { type: 'MAPS', name: 'OSRM' } });
  if (osrmRow) {
    await prisma.integration.update({
      where: { id: osrmRow.id },
      data: { baseUrl: osrmBase, status: 'ACTIVE' },
    });
    console.log(`✅ OSRM (integração): baseUrl atualizado → ${osrmBase}`);
  } else {
    await prisma.integration.create({
      data: {
        name: 'OSRM',
        type: 'MAPS',
        description: 'Open Source Routing Machine — ETAs (servidor Lansolver ou OSRM_BASE_URL)',
        baseUrl: osrmBase,
        status: 'ACTIVE',
      },
    });
    console.log(`✅ OSRM (integração): criado → ${osrmBase}`);
  }

  // ── Avaliação demo (Minha Produtividade) — primeiro prestador ACTIVE ───────
  try {
    const { getOrCreateDefaultClientTemplate } = require('./lib/evaluationTrigger');
    const techUser = await prisma.user.findFirst({
      where: { technicianProfile: { status: 'ACTIVE' } },
    });
    if (techUser) {
      const tmpl = await getOrCreateDefaultClientTemplate(techUser.tenantId);
      const questions = await prisma.evaluationTemplateQuestion.findMany({
        where: { templateId: tmpl.id },
        orderBy: { sortOrder: 'asc' },
      });
      const existingDemo = await prisma.evaluationInstance.findFirst({
        where: { technicianUserId: techUser.id, idempotencyKey: 'seed:demo_evaluation_v1' },
      });
      if (!existingDemo && questions.length >= 3) {
        const inst = await prisma.evaluationInstance.create({
          data: {
            tenantId: techUser.tenantId,
            templateId: tmpl.id,
            targetType: 'TECHNICIAN',
            technicianUserId: techUser.id,
            status: 'RESPONDED',
            triggeredBy: 'SEED',
            idempotencyKey: 'seed:demo_evaluation_v1',
            displayText:
              'Bom trabalho no atendimento. Cliente satisfeito com o resultado final.',
            rawClientText: '[seed_demo]',
          },
        });
        const values = [5, 4, 5];
        for (let i = 0; i < questions.length; i++) {
          await prisma.evaluationResponse.create({
            data: {
              instanceId: inst.id,
              questionId: questions[i].id,
              value: { value: values[i] ?? 4 },
            },
          });
        }
        const total100 = Math.round(((5 + 4 + 5) / 3 / 5) * 100);
        await prisma.evaluationScore.create({
          data: {
            instanceId: inst.id,
            totalScore: total100,
            scoreByCategory: { qualidade: 100, prazo: 80, atendimento: 100 },
            classification: 'EXCELLENT',
          },
        });
      }
      console.log('✅ Avaliação demo (Minha Produtividade) verificada');
    }

    const { newPublicTokenFields } = require('./lib/evaluationTrigger');
    const pendingNoToken = await prisma.evaluationInstance.findMany({
      where: { status: 'PENDING', publicToken: null },
      select: { id: true },
    });
    for (const row of pendingNoToken) {
      await prisma.evaluationInstance.update({
        where: { id: row.id },
        data: newPublicTokenFields(),
      });
    }
    if (pendingNoToken.length) {
      console.log(`✅ Tokens públicos de avaliação: ${pendingNoToken.length} instância(s) atualizada(s)`);
    }
  } catch (e) {
    console.warn('⚠️  Seed avaliação demo:', e.message);
  }

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log(`   Admin: ${adminEmail} / ${process.env.ADMIN_PASSWORD || 'admin123'}\n`);
}

main()
  .catch(err => { console.error('❌ Seed error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
