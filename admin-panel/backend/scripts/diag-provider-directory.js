'use strict';

/**
 * Diagnóstico read-only para o diretório de prestadores (perfil técnico / identidade / tenants).
 *
 *   cd admin-panel/backend && node scripts/diag-provider-directory.js
 */

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  ...(process.env.NODE_ENV === 'production' ? {} : { override: true }),
});

const prisma = require('../src/db');
const { resolveSharedRegistrationTenant } = require('../src/lib/resolveSharedRegistrationTenant');

async function main() {
  const shared = await resolveSharedRegistrationTenant(prisma).catch(() => null);

  const [activeUsers, withTp, withPi, withTpOrPi, inactiveWithProfile] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true, technicianProfile: { isNot: null } } }),
    prisma.user.count({ where: { isActive: true, providerIdentity: { isNot: null } } }),
    prisma.user.count({
      where: {
        isActive: true,
        OR: [{ technicianProfile: { isNot: null } }, { providerIdentity: { isNot: null } }],
      },
    }),
    prisma.user.count({
      where: {
        isActive: false,
        OR: [{ technicianProfile: { isNot: null } }, { providerIdentity: { isNot: null } }],
      },
    }),
  ]);

  const grouped = await prisma.user.groupBy({
    by: ['tenantId'],
    where: {
      isActive: true,
      OR: [{ technicianProfile: { isNot: null } }, { providerIdentity: { isNot: null } }],
    },
    _count: { _all: true },
  });
  grouped.sort((a, b) => b._count._all - a._count._all);
  const tenantIds = grouped.slice(0, 25).map((g) => g.tenantId);
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, slug: true, kind: true, name: true },
  });
  const tMap = new Map(tenants.map((t) => [t.id, t]));
  const byTenant = grouped.slice(0, 25).map((g) => {
    const t = tMap.get(g.tenantId);
    return {
      slug: t?.slug || '?',
      kind: t?.kind || '?',
      name: t?.name || '?',
      users_with_tp_or_pi: g._count._all,
    };
  });

  const affCount = await prisma.providerTenantAffiliation.count();
  const affByStatus = await prisma.providerTenantAffiliation.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  console.log('=== resolveSharedRegistrationTenant ===');
  console.log(shared ? JSON.stringify(shared, null, 2) : '(null — verificar slug master / env APP_REGISTRATION_SHARED_TENANT_*)');
  console.log('\n=== User counts ===');
  console.log({ activeUsers, withTechnicianProfile: withTp, withProviderIdentity: withPi, directoryEligible: withTpOrPi, inactiveButHadProfile: inactiveWithProfile });

  console.log('\n=== Active users with TP or PI, by tenant (top 25) ===');
  console.table(byTenant);

  console.log('\n=== ProviderTenantAffiliation total ===', affCount);
  console.log('By status:', affByStatus);

  const masterSlug = await prisma.tenant.findFirst({
    where: { slug: { equals: 'master', mode: 'insensitive' } },
    select: { id: true, slug: true, kind: true, name: true },
  });
  console.log('\n=== Tenant slug master ===', masterSlug || '(não encontrada)');

  if (masterSlug?.id) {
    const onShared = await prisma.user.count({
      where: {
        tenantId: masterSlug.id,
        isActive: true,
        OR: [{ technicianProfile: { isNot: null } }, { providerIdentity: { isNot: null } }],
      },
    });
    console.log('Active directory-eligible on master:', onShared);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
