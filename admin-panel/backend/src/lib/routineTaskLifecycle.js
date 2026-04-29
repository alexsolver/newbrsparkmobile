'use strict';

const { routineTaskMetadataFromTemplate } = require('./routineTaskMetadata');
const {
  reconcileRoutineBuffersForAssignment,
  ACTIVE_STATUSES,
} = require('./routineTaskMobileBuffer');
const { resolveActiveUserIdsForDispatchOwnerEmail } = require('./userEmailUnique');

/**
 * Cria a próxima execução RT (PENDING → tratada como fluxo direto no app) após submissão concluída.
 * Mantém a fila pré-carregada conforme `RoutineTaskAssignment.mobilePrefetchSlots`.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ completedExecutionId: string }} opts
 * @returns {Promise<{ id: string; routineTaskNumber: string; templateId: string } | null>}
 */
async function createNextRoutineTaskAfterComplete(prisma, { completedExecutionId }) {
  const ex = await prisma.checklistExecution.findUnique({
    where: { id: completedExecutionId },
    select: {
      id: true,
      routineTaskNumber: true,
      templateId: true,
      ownerEmail: true,
      status: true,
    },
  });
  if (!ex?.routineTaskNumber || !ex.templateId) return null;
  const st = String(ex.status || '').toUpperCase();
  if (st !== 'COMPLETED' && st !== 'SYNCED') return null;

  const ownerUserIds = await resolveActiveUserIdsForDispatchOwnerEmail(prisma, ex.ownerEmail);
  if (ownerUserIds.length === 0) return null;

  const assign = await prisma.routineTaskAssignment.findFirst({
    where: {
      templateId: ex.templateId,
      userId: { in: ownerUserIds },
    },
  });
  if (!assign) return null;

  try {
    await reconcileRoutineBuffersForAssignment(prisma, assign);
  } catch (e) {
    console.error('[routineTask] reconcile após conclusão', e);
  }

  const head = await prisma.checklistExecution.findFirst({
    where: {
      ownerEmail: { equals: ex.ownerEmail, mode: 'insensitive' },
      templateId: ex.templateId,
      routineTaskNumber: { not: null },
      status: { in: ACTIVE_STATUSES },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, routineTaskNumber: true, templateId: true },
  });
  if (!head?.routineTaskNumber) return null;
  return {
    id: head.id,
    routineTaskNumber: head.routineTaskNumber,
    templateId: head.templateId,
  };
}

module.exports = {
  routineTaskMetadataFromTemplate,
  createNextRoutineTaskAfterComplete,
};
