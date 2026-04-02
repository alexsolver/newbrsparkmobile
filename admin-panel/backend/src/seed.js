'use strict';
/**
 * Seed script — populates the database with initial data.
 * Run: node src/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt  = require('bcryptjs');
const prisma  = require('./db');

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
      features: { stock: true, vault: false, ai: false, documents: true, insurance: false }
    }}),
    prisma.plan.upsert({ where: { name: 'Pro' }, update: {}, create: {
      name: 'Pro', priceMonthly: 399, priceYearly: 3990, maxAssets: 500, maxUsers: 20, storageGb: 50,
      features: { stock: true, vault: true, ai: true, documents: true, insurance: true }
    }}),
    prisma.plan.upsert({ where: { name: 'Enterprise' }, update: {}, create: {
      name: 'Enterprise', priceMonthly: 2400, priceYearly: 24000, maxAssets: -1, maxUsers: -1, storageGb: 500,
      features: { stock: true, vault: true, ai: true, documents: true, insurance: true, reports: true, realtime: true }
    }}),
  ]);
  console.log(`✅ Plans: ${plans.map(p => p.name).join(', ')}`);

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

    // Service Categories (Aligned with app (tabs)/services.tsx)
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
  console.log(`✅ Metatags: ${metatags.length} tags seeded`);

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
  ];
  for (const t of templates) {
    await prisma.notificationTemplate.upsert({
      where: { key: t.key }, update: {}, create: { ...t, variables: Object.fromEntries((t.body.match(/\{\{(\w+)\}\}/g) || []).map(v => [v.replace(/\{|\}/g, ''), 'string'])) }
    });
  }
  console.log(`✅ Notification templates: ${templates.length} seeded`);

  console.log('\n🎉 Seed concluído com sucesso!');
  console.log(`   Admin: ${adminEmail} / ${process.env.ADMIN_PASSWORD || 'admin123'}\n`);
}

main()
  .catch(err => { console.error('❌ Seed error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
