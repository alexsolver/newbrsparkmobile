'use strict';

/**
 * Migra utilizadores «app móvel» que ainda estão na tenant master (ex.: slug aria)
 * para uma tenant nova `CLIENT`, movendo também dados directamente ligados ao utilizador
 * na tenant antiga (ativos criados por si, batidas de ponto, RT, auditoria, etc.).
 *
 * Uso (a partir de admin-panel/backend):
 *   node scripts/migrate-legacy-master-users-to-client-tenant.js
 *   node scripts/migrate-legacy-master-users-to-client-tenant.js --apply --limit=5 --confirm=MIGRATE-LEGACY-USERS
 *   node scripts/migrate-legacy-master-users-to-client-tenant.js --apply --user-id=cuid... --confirm=MIGRATE-LEGACY-USERS
 *
 * Por omissão corre em modo relatório (dry-run). Requer DATABASE_URL e tenant master resolvida
 * (`resolveAppDefaultTenantId` / seed).
 */

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  ...(process.env.NODE_ENV === 'production' ? {} : { override: true }),
});

const prisma = require('../src/db');
const { resolveAppDefaultTenantId } = require('../src/lib/appDefaultTenant');
const { syntheticTenantOwnerEmailForClientSpace } = require('../src/lib/registerPersonalClientTenant');

function parseArgs(argv) {
  const out = { apply: false, dryRun: true, limit: 50, userId: null, confirm: '' };
  for (const a of argv.slice(2)) {
    if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    } else if (a.startsWith('--limit=')) {
      out.limit = Math.max(1, Math.min(5000, Number(a.slice(8)) || 50));
    } else if (a.startsWith('--user-id=')) {
      out.userId = String(a.slice(10)).trim() || null;
    } else if (a.startsWith('--confirm=')) {
      out.confirm = String(a.slice(10)).trim();
    }
  }
  return out;
}

async function countRelated(prisma, legacyTenantId, userId) {
  const [assets, audits, punches, rta, materials, revenue] = await Promise.all([
    prisma.asset.count({ where: { tenantId: legacyTenantId, createdByUserId: userId } }),
    prisma.auditLog.count({ where: { tenantId: legacyTenantId, userId } }),
    prisma.workTimePunch.count({ where: { tenantId: legacyTenantId, userId } }),
    prisma.routineTaskAssignment.count({ where: { tenantId: legacyTenantId, userId } }),
    prisma.materialsReceiptInput.count({ where: { tenantId: legacyTenantId, conductorId: userId } }),
    prisma.technicianRevenueInput.count({ where: { tenantId: legacyTenantId, conductorId: userId } }),
  ]);
  return { assets, audits, punches, rta, materials, revenue };
}

async function hasClientSpaceForEmail(prisma, emailNorm) {
  const row = await prisma.user.findFirst({
    where: { email: { equals: emailNorm, mode: 'insensitive' }, tenant: { kind: 'CLIENT' } },
    select: { id: true, tenantId: true },
  });
  return !!row;
}

async function listEligibleUsers(prisma, legacyTenantId, { limit, userId }) {
  const where = {
    tenantId: legacyTenantId,
    role: 'USER',
    isActive: true,
    technicianProfile: null,
    ...(userId ? { id: userId } : {}),
  };
  return prisma.user.findMany({
    where,
    include: { tenant: { select: { id: true, slug: true, kind: true, name: true } } },
    orderBy: { createdAt: 'asc' },
    take: userId ? 1 : limit,
  });
}

async function migrateOneUser(prisma, legacyTenantId, user, dryRun) {
  const emailNorm = String(user.email || '').trim().toLowerCase();
  const rel = await countRelated(prisma, legacyTenantId, user.id);

  if (await hasClientSpaceForEmail(prisma, emailNorm)) {
    return {
      skipped: true,
      reason: 'Já existe conta com este e-mail numa tenant CLIENT (espaço pessoal ou criado via /me/workspaces).',
      userId: user.id,
      email: emailNorm,
      rel,
    };
  }

  if (dryRun) {
    return { skipped: false, dryRun: true, userId: user.id, email: emailNorm, rel };
  }

  let slug = '';
  for (let i = 0; i < 8; i++) {
    slug = `mig-cliente-${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 10)}`.toLowerCase();
    const clash = await prisma.tenant.findUnique({ where: { slug } });
    if (!clash) break;
  }

  const newTenantId = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: String(user.name || '').trim() || emailNorm.split('@')[0] || 'Cliente',
        slug,
        email: syntheticTenantOwnerEmailForClientSpace(emailNorm),
        ownerName: String(user.name || '').trim() || emailNorm.split('@')[0],
        kind: 'CLIENT',
        status: 'TRIAL',
        phone: user.phone || null,
      },
    });

    await tx.asset.updateMany({
      where: { tenantId: legacyTenantId, createdByUserId: user.id },
      data: { tenantId: tenant.id },
    });
    await tx.auditLog.updateMany({
      where: { tenantId: legacyTenantId, userId: user.id },
      data: { tenantId: tenant.id },
    });
    await tx.workTimePunch.updateMany({
      where: { tenantId: legacyTenantId, userId: user.id },
      data: { tenantId: tenant.id },
    });
    await tx.routineTaskAssignment.updateMany({
      where: { tenantId: legacyTenantId, userId: user.id },
      data: { tenantId: tenant.id },
    });
    await tx.materialsReceiptInput.updateMany({
      where: { tenantId: legacyTenantId, conductorId: user.id },
      data: { tenantId: tenant.id },
    });
    await tx.technicianRevenueInput.updateMany({
      where: { tenantId: legacyTenantId, conductorId: user.id },
      data: { tenantId: tenant.id },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { tenantId: tenant.id },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: 'USER_MIGRATED_LEGACY_MASTER_TO_CLIENT',
        resource: emailNorm,
        category: 'SYSTEM',
        metadata: { fromTenantId: legacyTenantId },
      },
    });

    return tenant.id;
  });

  return {
    skipped: false,
    dryRun: false,
    userId: user.id,
    email: emailNorm,
    newTenantId,
    rel,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const legacyTenantId = await resolveAppDefaultTenantId();
  if (!legacyTenantId) {
    console.error('[migrate] Não foi possível resolver a tenant master (APP_DEFAULT_TENANT_ID / slug aria).');
    process.exit(1);
  }

  const master = await prisma.tenant.findUnique({
    where: { id: legacyTenantId },
    select: { id: true, slug: true, kind: true, name: true },
  });
  if (!master) {
    console.error('[migrate] Tenant master não encontrada na base.');
    process.exit(1);
  }

  console.log(
    `[migrate] Tenant legada: id=${master.id} slug=${master.slug} kind=${master.kind} name=${master.name}`,
  );
  console.log(
    `[migrate] Modo: ${args.dryRun ? 'DRY-RUN (relatório)' : 'APLICAR'} limit=${args.limit}${args.userId ? ` user-id=${args.userId}` : ''}`,
  );

  if (!args.dryRun && args.confirm !== 'MIGRATE-LEGACY-USERS') {
    console.error('[migrate] Para aplicar, passe --confirm=MIGRATE-LEGACY-USERS (proteção contra execução acidental).');
    process.exit(1);
  }

  const users = await listEligibleUsers(prisma, legacyTenantId, {
    limit: args.limit,
    userId: args.userId,
  });

  if (!users.length) {
    console.log('[migrate] Nenhum utilizador elegível (USER activo, sem technicianProfile, na tenant master).');
    await prisma.$disconnect();
    return;
  }

  let migrated = 0;
  let skipped = 0;
  for (const u of users) {
    const r = await migrateOneUser(prisma, legacyTenantId, u, args.dryRun);
    if (r.skipped) {
      skipped += 1;
      console.log(`[SKIP] ${r.userId} ${r.email} — ${r.reason}`);
    } else if (r.dryRun) {
      console.log(
        `[DRY] ${r.userId} ${r.email} assets=${r.rel.assets} audit=${r.rel.audits} punches=${r.rel.punches} rta=${r.rel.rta} materials=${r.rel.materials} revenue=${r.rel.revenue}`,
      );
    } else {
      migrated += 1;
      console.log(
        `[OK] ${r.userId} ${r.email} → tenant ${r.newTenantId} (assets=${r.rel.assets} audit=${r.rel.audits} …)`,
      );
    }
  }

  const reported = args.dryRun ? users.length - skipped : migrated;
  console.log(`[migrate] Resumo: ${args.dryRun ? 'relatórios' : 'migrados'}=${reported} skipped=${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect().finally(() => process.exit(1));
});
