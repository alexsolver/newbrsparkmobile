#!/usr/bin/env node
'use strict';

/**
 * Publica a Política de Privacidade v2026.04.x nos quatro locales (pt-BR, en-US, es-ES, de-DE),
 * espelhando a lógica de PATCH /api/compliance/:id/publish (arquiva ativos anteriores do mesmo tipo+locale).
 *
 * Pré-requisito: documentos já upsertados (ex.: node scripts/seed-compliance-ptbr.js).
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** IDs alinhados a compliancePtBrLegalDocs + complianceLegalGovernanceI18n (buildDocsForLocale). */
const PRIVACY_DOC_IDS = [
  'legal-ptbr-privacy-policy-2026041',
  'legal-enus-privacy-policy-2026041',
  'legal-eses-privacy-policy-2026041',
  'legal-dede-privacy-policy-2026041',
];

async function publishOne(docId, reviewedBy) {
  const doc = await prisma.complianceDoc.findUnique({ where: { id: docId } });
  if (!doc) {
    console.warn(`[publish-privacy] Ignorado (não existe na BD): ${docId}`);
    return { skipped: true, id: docId };
  }
  if (doc.archivedAt) {
    console.warn(`[publish-privacy] Ignorado (arquivado): ${docId}`);
    return { skipped: true, id: docId };
  }
  if (doc.type !== 'PRIVACY_POLICY') {
    throw new Error(`[publish-privacy] ID ${docId} não é PRIVACY_POLICY (é ${doc.type}).`);
  }

  await prisma.complianceDoc.updateMany({
    where: {
      type: doc.type,
      isActive: true,
      locale: doc.locale,
      tenantId: null,
      archivedAt: null,
    },
    data: { isActive: false, reviewStatus: 'ARCHIVED', archivedAt: new Date() },
  });

  const updated = await prisma.complianceDoc.update({
    where: { id: docId },
    data: {
      isActive: true,
      publishedAt: new Date(),
      effectiveFrom: doc.effectiveFrom || new Date(),
      reviewStatus: 'PUBLISHED',
      reviewedBy: doc.reviewedBy || reviewedBy,
      reviewedAt: doc.reviewedAt || new Date(),
      archivedAt: null,
    },
  });

  console.log(`[publish-privacy] Publicado: ${updated.locale} — ${updated.title} (${updated.id})`);
  return { skipped: false, id: docId, locale: updated.locale };
}

async function main() {
  const reviewedBy = process.env.ADMIN_EMAIL || 'compliance-script@aria.com';
  const results = [];
  for (const id of PRIVACY_DOC_IDS) {
    results.push(await publishOne(id, reviewedBy));
  }
  const skipped = results.filter((r) => r.skipped);
  if (skipped.length === PRIVACY_DOC_IDS.length) {
    console.error(
      '[publish-privacy] Nenhum documento publicado. Rode antes: node scripts/seed-compliance-ptbr.js',
    );
    process.exitCode = 1;
    return;
  }
  if (skipped.length) {
    console.warn(`[publish-privacy] ${skipped.length} locale(s) sem linha na BD — execute o seed e repita.`);
  }
}

main()
  .catch((err) => {
    console.error('[publish-privacy] Erro:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
