'use strict';

/**
 * Migra todos os utilizadores e dados directamente ligados a tenants `CLIENT` ou `PROVIDER`
 * para uma tenant destino do tipo `COMPANY` (por omissão: slug `master`), e apaga essas tenants.
 *
 * AVISOS:
 * - Todos os `User` nas tenants de origem passam a partilhar a mesma tenant destino (comportamento tipo «app público»).
 * - `employeeMatricula` é anulada nos utilizadores movidos para evitar violar @@unique([tenantId, employeeMatricula]).
 * - Papel `PROVIDER` nos utilizadores movidos é normalizado para `USER` (tenant destino é empresa partilhada).
 * - Subscrições e faturas das tenants CLIENT/PROVIDER são removidas (dados de billing pessoais).
 * - `TranslationOverride`, `FeatureFlag` e `CollectionPolicy` por tenant de origem são apagados (evita conflitos de unicidade).
 * - `ConsentRecord` com `tenantId` nas tenants de origem são apagados (evita duplicar @@unique com a tenant destino).
 * - `ComplianceDoc` ligados só a essas tenants passam a `tenantId` null (documentos deixam de ser override por org).
 * - `ProviderTenantAffiliation` com `tenantId` nas tenants de origem são apagados (não devem apontar para espaços pessoais).
 *
 * Uso (a partir de admin-panel/backend):
 *   node scripts/migrate-client-provider-tenants-to-company.js
 *   node scripts/migrate-client-provider-tenants-to-company.js --apply --confirm=MERGE-CLIENT-PROVIDER-TO-COMPANY
 *
 * Variáveis opcionais:
 *   MIGRATION_TARGET_TENANT_ID=cuid   ou   MIGRATION_TARGET_TENANT_SLUG=master
 */

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../.env'),
  ...(process.env.NODE_ENV === 'production' ? {} : { override: true }),
});

const prisma = require('../src/db');

const DEFAULT_TARGET_SLUG = 'master';
const REQUIRED_CONFIRM = 'MERGE-CLIENT-PROVIDER-TO-COMPANY';

function parseArgs(argv) {
  const out = { apply: false, confirm: '' };
  for (const a of argv.slice(2)) {
    if (a === '--apply') out.apply = true;
    else if (a.startsWith('--confirm=')) out.confirm = String(a.slice(10)).trim();
  }
  return out;
}

async function resolveTargetTenantId() {
  const idRaw = String(process.env.MIGRATION_TARGET_TENANT_ID || '').trim();
  if (idRaw) {
    const t = await prisma.tenant.findUnique({ where: { id: idRaw } });
    return t;
  }
  const slugRaw = String(process.env.MIGRATION_TARGET_TENANT_SLUG || DEFAULT_TARGET_SLUG).trim();
  return prisma.tenant.findFirst({
    where: { slug: { equals: slugRaw, mode: 'insensitive' } },
  });
}

async function main() {
  const { apply, confirm } = parseArgs(process.argv);

  const target = await resolveTargetTenantId();
  if (!target) {
    console.error(
      `[migrate] Tenant destino não encontrada. Defina MIGRATION_TARGET_TENANT_SLUG (omissão: ${DEFAULT_TARGET_SLUG}) ou MIGRATION_TARGET_TENANT_ID.`,
    );
    process.exit(1);
  }

  if (String(target.kind).toUpperCase() !== 'COMPANY') {
    console.error(
      `[migrate] Tenant destino "${target.slug}" tem kind=${target.kind}. Ajuste para COMPANY antes de continuar.`,
    );
    process.exit(1);
  }

  const doom = await prisma.tenant.findMany({
    where: {
      id: { not: target.id },
      kind: { in: ['CLIENT', 'PROVIDER'] },
    },
    select: { id: true, slug: true, kind: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  const doomIds = doom.map((d) => d.id);
  if (!doomIds.length) {
    console.log('[migrate] Nenhuma tenant CLIENT ou PROVIDER para migrar.');
    return;
  }

  const userCount = await prisma.user.count({ where: { tenantId: { in: doomIds } } });
  const assetCount = await prisma.asset.count({ where: { tenantId: { in: doomIds } } });
  const locCount = await prisma.location.count({ where: { tenantId: { in: doomIds } } });

  console.log(`[migrate] Destino: ${target.name} (${target.slug}) id=${target.id} kind=${target.kind}`);
  console.log(`[migrate] Tenants a eliminar após migração: ${doom.length}`);
  doom.slice(0, 30).forEach((d) => console.log(`   - ${d.kind} ${d.slug} (${d.name})`));
  if (doom.length > 30) console.log(`   ... +${doom.length - 30} mais`);
  console.log(`[migrate] Utilizadores a mover: ${userCount}`);
  console.log(`[migrate] Ativos / locais (tenant scope): ${assetCount} / ${locCount}`);

  if (!apply) {
    console.log('\n[migrate] Modo relatório (dry-run). Para aplicar:');
    console.log(
      `   node scripts/migrate-client-provider-tenants-to-company.js --apply --confirm=${REQUIRED_CONFIRM}`,
    );
    return;
  }

  if (confirm !== REQUIRED_CONFIRM) {
    console.error(`[migrate] Confirmação inválida. Use exatamente: --confirm=${REQUIRED_CONFIRM}`);
    process.exit(1);
  }

  await prisma.$transaction(
    async (tx) => {
      // --- Remover billing das tenants de origem ---
      const subs = await tx.subscription.findMany({
        where: { tenantId: { in: doomIds } },
        select: { id: true },
      });
      for (const s of subs) {
        await tx.invoice.deleteMany({ where: { subscriptionId: s.id } });
        await tx.subscription.delete({ where: { id: s.id } });
      }

      await tx.tenantPlanUsagePeriod.deleteMany({ where: { tenantId: { in: doomIds } } });
      await tx.workTimeSettings.deleteMany({ where: { tenantId: { in: doomIds } } });
      await tx.providerTenantAffiliation.deleteMany({ where: { tenantId: { in: doomIds } } });
      await tx.translationOverride.deleteMany({ where: { tenantId: { in: doomIds } } });
      await tx.featureFlag.deleteMany({ where: { tenantId: { in: doomIds } } });

      const doomedPolicies = await tx.collectionPolicy.findMany({
        where: { tenantId: { in: doomIds } },
        select: { id: true },
      });
      const policyIds = doomedPolicies.map((p) => p.id);
      if (policyIds.length) {
        await tx.consentRecord.deleteMany({ where: { policyId: { in: policyIds } } });
        await tx.collectionPolicy.deleteMany({ where: { id: { in: policyIds } } });
      }

      // Referência: bibliotecas inteiras mudam de tenant
      await tx.referenceLibrary.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.location.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.asset.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.auditLog.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.technicianRegistrationApplication.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.workTimePunch.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.routineTaskAssignment.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.materialsReceiptInput.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.technicianRevenueInput.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.checklistTemplate.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.evaluationTemplate.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.evaluationInstance.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.evaluationActionPlan.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.evaluationDispute.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.pdfReportPreset.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.telemetryEvent.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.executionMetric.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      await tx.consentRecord.deleteMany({
        where: { tenantId: { in: doomIds } },
      });

      await tx.complianceDoc.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: null },
      });

      await tx.trackingChatModerationEvent.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      // Utilizadores: matrícula e papel antes do movimento único de tenant
      await tx.user.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { employeeMatricula: null },
      });

      await tx.user.updateMany({
        where: { tenantId: { in: doomIds }, role: 'PROVIDER' },
        data: { role: 'USER' },
      });

      await tx.user.updateMany({
        where: { tenantId: { in: doomIds } },
        data: { tenantId: target.id },
      });

      const deleted = await tx.tenant.deleteMany({
        where: { id: { in: doomIds } },
      });

      console.log(`[migrate] Tenants eliminadas: ${deleted.count}`);
    },
    { timeout: 600_000 },
  );

  console.log('[migrate] Concluído com sucesso.');
}

main()
  .catch((e) => {
    console.error('[migrate] Erro:', e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
