#!/usr/bin/env node
'use strict';

/**
 * Diagnóstico: prestador de destino (ownerEmail), modo BROADCAST/DIRECT, candidatos e tenant
 * para uma ou mais OS (por número completo ou trecho do `osNumber`).
 *
 * Uso (admin-panel/backend, com .env e DATABASE_URL):
 *   node scripts/diagnoseOsDestination.js 400 401 500
 *   node scripts/diagnoseOsDestination.js FT-2026-04-0000400
 *
 * Ajuda a explicar por que uma OS aparece no `/api/sync/tasks` e outra não:
 * - ownerEmail diferente dos candidatos do utilizador logado no app
 * - BROADCAST sem o e-mail na lista `broadcastCandidates`
 * - filtro multi-tenant (`template.tenantId` / `metadata.fieldTaskContextTenantId`)
 * - concluídas: o sync só envia as 400 mais recentes por `ownerEmail` (ver sync.js `take: 400` em doneOs)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../src/db');

function metaTenantId(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const v = metadata.fieldTaskContextTenantId;
  return v != null && String(v).trim() !== '' ? String(v).trim() : null;
}

async function rankAmongCompletedForOwner(ownerEmail, executionId) {
  const em = String(ownerEmail || '').trim();
  if (!em) return { rank: null, total: null, beyondSyncTake400: null };
  const rows = await prisma.checklistExecution.findMany({
    where: {
      ownerEmail: { equals: em, mode: 'insensitive' },
      routineTaskNumber: null,
      status: { in: ['COMPLETED', 'SYNCED'] },
    },
    select: { id: true, completedAt: true, createdAt: true },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const idx = rows.findIndex((r) => r.id === executionId);
  const rank = idx >= 0 ? idx + 1 : null;
  return {
    rank,
    total: rows.length,
    beyondSyncTake400: idx >= 400,
  };
}

async function findByToken(token) {
  const t = String(token || '').trim();
  if (!t) return [];
  return prisma.checklistExecution.findMany({
    where: {
      osNumber: { contains: t, mode: 'insensitive' },
      routineTaskNumber: null,
    },
    select: {
      id: true,
      osNumber: true,
      ownerEmail: true,
      status: true,
      assignmentMode: true,
      claimStatus: true,
      broadcastCandidates: true,
      metadata: true,
      createdAt: true,
      completedAt: true,
      template: { select: { id: true, title: true, tenantId: true } },
      assetId: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
}

async function main() {
  const tokens = process.argv.slice(2).filter(Boolean);
  if (!tokens.length) {
    console.error(
      'Uso:\n  node scripts/diagnoseOsDestination.js <trecho-osNumber> [outro ...]\n  Ex.: node scripts/diagnoseOsDestination.js 0000400 0000401 0000500',
    );
    process.exit(1);
  }

  for (const tok of tokens) {
    const rows = await findByToken(tok);
    console.log('\n========== osNumber contém:', JSON.stringify(tok), '| matches:', rows.length, '==========');
    if (!rows.length) {
      console.log('(nenhuma execução FT com routineTaskNumber null — verifique o número ou RT.)');
      continue;
    }
    for (const ex of rows) {
      const ftTenant = metaTenantId(ex.metadata);
      const rankInfo = await rankAmongCompletedForOwner(ex.ownerEmail, ex.id);
      const line = {
        id: ex.id,
        osNumber: ex.osNumber,
        ownerEmail: ex.ownerEmail,
        status: ex.status,
        assignmentMode: ex.assignmentMode || 'DIRECT',
        claimStatus: ex.claimStatus,
        broadcastCandidates: ex.broadcastCandidates,
        templateTenantId: ex.template?.tenantId ?? null,
        fieldTaskContextTenantId: ftTenant,
        assetId: ex.assetId,
        templateTitle: ex.template?.title ?? null,
        createdAt: ex.createdAt,
        completedAt: ex.completedAt,
        completedRankForSameOwner: rankInfo.rank,
        completedTotalForSameOwner: rankInfo.total,
        likelyExcludedFromMobileSync_doneTake400:
          rankInfo.beyondSyncTake400 === true &&
          (ex.status === 'COMPLETED' || ex.status === 'SYNCED'),
      };
      console.log(JSON.stringify(line, null, 2));
    }
  }

  console.log(
    '\nNota: GET /api/sync/tasks inclui no máximo 400 OS concluídas (COMPLETED/SYNCED) por ownerEmail, ' +
      'ordenadas por completedAt desc. Acima da posição 400, a OS não vai no JSON do pull.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
