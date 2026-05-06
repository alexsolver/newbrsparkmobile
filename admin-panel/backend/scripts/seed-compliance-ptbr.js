#!/usr/bin/env node
'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { EFFECTIVE_FROM, VERSION, legalDocsPtBr } = require('../src/seedData/compliancePtBrLegalDocs');
const { legalDocsEnUs, legalDocsEsEs, legalDocsDeDe } = require('../src/seedData/complianceLegalGovernanceI18n');

const prisma = new PrismaClient();

/** IDs antigos do `seed.js` (ToU/Privacidade curtos v1.0) — desativar para evitar múltiplos ativos por tipo+locale. */
const LEGACY_SHORT_I18N_DOC_IDS = [
  'terms-v1-en',
  'privacy-v1-en',
  'terms-v1-es',
  'privacy-v1-es',
  'terms-v1-de',
  'privacy-v1-de',
];

const LOCALE_BUNDLES = [
  ['pt-BR', legalDocsPtBr],
  ['en-US', legalDocsEnUs],
  ['es-ES', legalDocsEsEs],
  ['de-DE', legalDocsDeDe],
];

async function main() {
  const createdBy = process.env.ADMIN_EMAIL || 'admin@aria.com';
  const effectiveFrom = new Date(EFFECTIVE_FROM);

  const deactivated = await prisma.complianceDoc.updateMany({
    where: { id: { in: LEGACY_SHORT_I18N_DOC_IDS } },
    data: { isActive: false },
  });
  if (deactivated.count > 0) {
    console.log(`[compliance] Documentos legados EN/ES/DE (v1.0) desativados: ${deactivated.count}`);
  }

  for (const [locale, docs] of LOCALE_BUNDLES) {
    console.log(`[compliance:${locale}] Upsert de ${docs.length} minutas v${VERSION}`);

    for (const doc of docs) {
      await prisma.complianceDoc.upsert({
        where: { id: doc.id },
        update: {
          type: doc.type,
          version: VERSION,
          locale,
          title: doc.title,
          content: doc.content,
          effectiveFrom,
          reviewStatus: 'LEGAL_REVIEW',
          reviewedBy: null,
          reviewedAt: null,
          archivedAt: null,
          changeSummary: doc.changeSummary,
          audience: doc.audience,
          platform: doc.platform,
          jurisdiction: doc.jurisdiction,
          legalBasis: doc.legalBasis,
          requiresAcceptance: doc.requiresAcceptance,
          blocking: doc.blocking,
          isActive: false,
          publishedAt: null,
          createdBy,
        },
        create: {
          id: doc.id,
          type: doc.type,
          version: VERSION,
          locale,
          title: doc.title,
          content: doc.content,
          effectiveFrom,
          reviewStatus: 'LEGAL_REVIEW',
          changeSummary: doc.changeSummary,
          audience: doc.audience,
          platform: doc.platform,
          jurisdiction: doc.jurisdiction,
          legalBasis: doc.legalBasis,
          requiresAcceptance: doc.requiresAcceptance,
          blocking: doc.blocking,
          isActive: false,
          publishedAt: null,
          createdBy,
        },
      });
      console.log(`  - ${locale} ${doc.type}: ${doc.title}`);
    }
  }

  console.log(
    '[compliance] Concluído. Todos os locales upsertados como LEGAL_REVIEW, não publicados (pt-BR, en-US, es-ES, de-DE).',
  );
}

main()
  .catch((err) => {
    console.error('[compliance] Erro:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
