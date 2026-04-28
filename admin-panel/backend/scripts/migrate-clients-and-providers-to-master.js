'use strict';

/**
 * Migra utilizadores «cliente / prestador» para a tenant COMPANY partilhada (omissão: `master`).
 *
 * Inclui `User` em tenants `COMPANY`, `CLIENT` ou `PROVIDER` (exceto destino e slugs exclusos) quando:
 * - `role` ∈ { USER, PROVIDER } **ou** existe `TechnicianProfile` **ou** existe `ProviderIdentity`
 * - e `role` ∉ { TENANT_ADMIN, MANAGER, SAAS_ADMIN }
 *
 * Não apaga tenants nem subscrições das empresas. Actualiza dados ligados ao utilizador (ativos criados por si,
 * RT, materiais/receitas, ponto, candidaturas técnicas, avaliações, auditoria parcial, telemetria).
 * Limpa `serviceLocationIds` do perfil técnico (referências a locais da tenant antiga deixariam de bater com `master`).
 *
 * Uso (a partir de admin-panel/backend):
 *   node scripts/migrate-clients-and-providers-to-master.js
 *   node scripts/migrate-clients-and-providers-to-master.js --apply --confirm=MIGRATE-CLIENTS-PROVIDERS-TO-MASTER
 *
 * Variáveis opcionais:
 *   MIGRATION_TARGET_TENANT_SLUG=master   ou   MIGRATION_TARGET_TENANT_ID=cuid
 *   MIGRATION_EXCLUDE_SOURCE_TENANT_SLUGS=lansolver,brspark   (CSV; omissão **exclui** esses slugs da origem)
 *   Defina `MIGRATION_EXCLUDE_SOURCE_TENANT_SLUGS=` (vazio) para não excluir nenhuma tenant de origem.
 */

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  ...(process.env.NODE_ENV === 'production' ? {} : { override: true }),
});

const prisma = require('../src/db');

const DEFAULT_TARGET_SLUG = 'master';
const REQUIRED_CONFIRM = 'MIGRATE-CLIENTS-PROVIDERS-TO-MASTER';

function parseArgs(argv) {
  const out = { apply: false, confirm: '' };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a.startsWith('--confirm=')) out.confirm = String(a.slice(10)).trim();
  }
  return out;
}

function resolveExcludeSlugSet() {
  const raw =
    process.env.MIGRATION_EXCLUDE_SOURCE_TENANT_SLUGS !== undefined
      ? String(process.env.MIGRATION_EXCLUDE_SOURCE_TENANT_SLUGS).trim()
      : 'lansolver,brspark';
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function resolveTargetTenant() {
  const idRaw = String(process.env.MIGRATION_TARGET_TENANT_ID || '').trim();
  if (idRaw) {
    const t = await prisma.tenant.findUnique({ where: { id: idRaw } });
    return t;
  }
  const slug = String(process.env.MIGRATION_TARGET_TENANT_SLUG || DEFAULT_TARGET_SLUG).trim();
  return prisma.tenant.findFirst({
    where: { slug: { equals: slug, mode: 'insensitive' } },
  });
}

async function main() {
  const { apply, confirm } = parseArgs(process.argv);
  const target = await resolveTargetTenant();
  if (!target) {
    console.error(
      `[migrate-cp-master] Tenant destino não encontrada. Defina MIGRATION_TARGET_TENANT_SLUG (omissão: ${DEFAULT_TARGET_SLUG}) ou MIGRATION_TARGET_TENANT_ID.`,
    );
    process.exit(1);
  }
  if (String(target.kind).toUpperCase() !== 'COMPANY') {
    console.error(`[migrate-cp-master] Tenant destino tem kind=${target.kind}; esperado COMPANY.`);
    process.exit(1);
  }

  const excludeSlugs = resolveExcludeSlugSet();
  if (excludeSlugs.size) {
    console.log(`[migrate-cp-master] Slugs de origem excluídos: ${[...excludeSlugs].join(', ')}`);
  }
  const allSources = await prisma.tenant.findMany({
    where: {
      id: { not: target.id },
      kind: { in: ['COMPANY', 'CLIENT', 'PROVIDER'] },
    },
    select: { id: true, slug: true, name: true, kind: true },
    orderBy: { slug: 'asc' },
  });
  const sourceTenants = allSources.filter((t) => !excludeSlugs.has(String(t.slug || '').toLowerCase()));
  const sourceIds = sourceTenants.map((t) => t.id);
  if (!sourceIds.length) {
    console.log('[migrate-cp-master] Nenhuma tenant de origem após exclusões.');
    return;
  }

  const movable = await prisma.user.findMany({
    where: {
      tenantId: { in: sourceIds },
      role: { notIn: ['TENANT_ADMIN', 'MANAGER', 'SAAS_ADMIN'] },
      OR: [
        { role: 'USER' },
        { role: 'PROVIDER' },
        { technicianProfile: { isNot: null } },
        { providerIdentity: { isNot: null } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      role: true,
      technicianProfile: { select: { id: true } },
      providerIdentity: { select: { id: true } },
    },
  });

  const movableIds = movable.map((u) => u.id);
  const movableEmails = [...new Set(movable.map((u) => String(u.email || '').trim().toLowerCase()).filter(Boolean))];

  console.log(`[migrate-cp-master] Destino: ${target.name} (${target.slug}) id=${target.id}`);
  console.log(`[migrate-cp-master] Tenants de origem: ${sourceTenants.length}`);
  console.log(`[migrate-cp-master] Utilizadores a mover: ${movable.length}`);
  if (movable.length && movable.length <= 40) {
    movable.forEach((u) =>
      console.log(`   - ${u.email}  role=${u.role}  fromTenant=${u.tenantId}`),
    );
  } else if (movable.length > 40) {
    movable.slice(0, 20).forEach((u) => console.log(`   - ${u.email}  role=${u.role}`));
    console.log(`   ... +${movable.length - 20} mais`);
  }

  if (!movableIds.length) {
    console.log('[migrate-cp-master] Nada a fazer.');
    return;
  }

  if (!apply) {
    console.log('\n[migrate-cp-master] Modo relatório (dry-run). Para aplicar:');
    console.log(
      `   node scripts/migrate-clients-and-providers-to-master.js --apply --confirm=${REQUIRED_CONFIRM}`,
    );
    return;
  }

  if (confirm !== REQUIRED_CONFIRM) {
    console.error(`[migrate-cp-master] Confirmação inválida. Use exatamente: --confirm=${REQUIRED_CONFIRM}`);
    process.exit(1);
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.technicianProfile.updateMany({
        where: { userId: { in: movableIds } },
        data: { serviceLocationIds: [] },
      });

      await tx.asset.updateMany({
        where: {
          createdByUserId: { in: movableIds },
          tenantId: { not: target.id },
        },
        data: { tenantId: target.id },
      });

      await tx.routineTaskAssignment.updateMany({
        where: { userId: { in: movableIds } },
        data: { tenantId: target.id },
      });

      await tx.materialsReceiptInput.updateMany({
        where: { conductorId: { in: movableIds } },
        data: { tenantId: target.id },
      });

      await tx.technicianRevenueInput.updateMany({
        where: { conductorId: { in: movableIds } },
        data: { tenantId: target.id },
      });

      await tx.workTimePunch.updateMany({
        where: { userId: { in: movableIds } },
        data: { tenantId: target.id },
      });

      await tx.technicianRegistrationApplication.updateMany({
        where: {
          tenantId: { in: sourceIds },
          OR: [{ candidateUserId: { in: movableIds } }, { createdUserId: { in: movableIds } }],
        },
        data: { tenantId: target.id },
      });

      await tx.evaluationInstance.updateMany({
        where: { technicianUserId: { in: movableIds } },
        data: { tenantId: target.id },
      });

      await tx.evaluationActionPlan.updateMany({
        where: { technicianUserId: { in: movableIds } },
        data: { tenantId: target.id },
      });

      await tx.evaluationDispute.updateMany({
        where: { technicianUserId: { in: movableIds } },
        data: { tenantId: target.id },
      });

      await tx.auditLog.updateMany({
        where: {
          userId: { in: movableIds },
          tenantId: { in: sourceIds },
        },
        data: { tenantId: target.id },
      });

      if (movableEmails.length) {
        const emailOr = movableEmails.map((e) => ({
          ownerEmail: { equals: e, mode: 'insensitive' },
        }));
        await tx.telemetryEvent.updateMany({
          where: {
            tenantId: { in: sourceIds },
            OR: emailOr,
          },
          data: { tenantId: target.id },
        });
        await tx.executionMetric.updateMany({
          where: {
            tenantId: { in: sourceIds },
            OR: emailOr,
          },
          data: { tenantId: target.id },
        });
      }

      await tx.user.updateMany({
        where: { id: { in: movableIds } },
        data: { employeeMatricula: null },
      });

      await tx.user.updateMany({
        where: { id: { in: movableIds }, role: 'PROVIDER' },
        data: { role: 'USER' },
      });

      const moved = await tx.user.updateMany({
        where: { id: { in: movableIds } },
        data: { tenantId: target.id },
      });

      console.log(`[migrate-cp-master] Utilizadores actualizados: ${moved.count}`);
    },
    { timeout: 600_000 },
  );

  console.log('[migrate-cp-master] Concluído com sucesso.');
}

main()
  .catch((e) => {
    console.error('[migrate-cp-master] Erro:', e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
