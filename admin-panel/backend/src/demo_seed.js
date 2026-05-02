'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

async function main() {
  console.log('🚀 Generating Demo Data for BrSpark Global SaaS...\n');

  // 1. Fetch Locale Profiles
  const br = await prisma.localeProfile.findFirst({ where: { countryCode: 'BR' } });
  const us = await prisma.localeProfile.findFirst({ where: { countryCode: 'US' } });
  const es = await prisma.localeProfile.findFirst({ where: { countryCode: 'ES' } });

  if (!br || !us || !es) {
     console.error('❌ Locale Profiles not found. Run standard seed first (npm run db:seed).');
     process.exit(1);
  }

  // 2. Fetch Plans
  const basic = await prisma.plan.findFirst({ where: { name: 'Basic' } });
  const pro = await prisma.plan.findFirst({ where: { name: 'Pro' } });
  const enterprise = await prisma.plan.findFirst({ where: { name: 'Enterprise' } });

  // 3. Create Demo Tenants
  const tenantsData = [
    { name: 'Brspark Global Brazil', slug: 'brspark-br', email: 'contato@brspark.br', localeId: br.id, planId: pro.id },
    { name: 'Solaris Energy US', slug: 'solaris-us', email: 'operations@solaris.us', localeId: us.id, planId: enterprise.id },
    { name: 'Iberia Logistics', slug: 'iberia-es', email: 'info@iberia.es', localeId: es.id, planId: basic.id },
  ];

  const hash = await bcrypt.hash('user123', 10);

  for (const t of tenantsData) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: t.slug },
      update: {},
      create: { 
        name: t.name, slug: t.slug, email: t.email, localeId: t.localeId, status: 'ACTIVE', ownerName: t.name.split(' ')[0]
      }
    });

    // Create Admin User for Tenant (bens demo ficam associados a este utilizador)
    const tenantAdmin = await prisma.user.upsert({
      where: { email_tenantId: { email: t.email, tenantId: tenant.id } },
      update: {},
      create: { 
        name: t.name + ' Admin', email: t.email, password: hash, tenantId: tenant.id, role: 'TENANT_ADMIN', isActive: true
      }
    });

    // Create Subscription
    await prisma.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: { 
        tenantId: tenant.id, planId: t.planId, status: 'ACTIVE', currentStart: new Date(), currentEnd: new Date(Date.now() + 30 * 86400000)
      }
    });

    // Create some Assets
    for (let i = 1; i <= 3; i++) {
        const asset = await prisma.asset.create({
            data: {
                tenantId: tenant.id,
                createdByUserId: tenantAdmin.id,
                title: `Asset ${i} - ${t.name}`,
                type: i === 1 ? 'REAL_ESTATE' : 'TERRESTRIAL',
                status: 'Operacional',
                description: `Demo asset for ${t.name}`
            }
        });

        // Create some StockItems (linked through Asset, NO direct tenantId in model)
        await prisma.stockItem.create({
            data: {
                assetId: asset.id,
                name: 'Item A',
                sku: `SKU-${tenant.slug}-${asset.id}-A`,
                currentStock: 10,
                minStock: 5,
                unit: 'un'
            }
        });
        
        // One critical stock item
        await prisma.stockItem.create({
            data: {
                assetId: asset.id,
                name: 'Item Crítico',
                sku: `SKU-${tenant.slug}-${asset.id}-B`,
                currentStock: 2,
                minStock: 5,
                unit: 'un'
            }
        });
    }

    // Add Audit Logs
    await prisma.auditLog.create({
        data: { tenantId: tenant.id, action: 'TENANT_PROVISIONED', resource: 'System', category: 'SYSTEM' }
    });
  }

  console.log('✅ Demo Tenants Provisioned: Brazil, US, Spain.');
  console.log('✅ Assets and Stock Items seeded.');
  console.log('\n🎉 Demo Seed completed! Refresh the dashboard.');
  process.exit();
}

main()
  .catch(err => { console.error('❌ Demo Seed error:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
