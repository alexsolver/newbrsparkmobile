'use strict';

const { allocateNextRtNumber } = require('./rtSerialNumber');
const { routineTaskMetadataFromTemplate } = require('./routineTaskMetadata');
const { consumeQuota } = require('./planQuotaService');

const MIN_SLOTS = 1;
const MAX_SLOTS = 20;

const ACTIVE_STATUSES = ['PENDING', 'RECEIVED', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED'];

function clampSlots(n) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return MIN_SLOTS;
  return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, x));
}

async function countActiveRtForTemplate(prisma, ownerEmail, templateId) {
  return prisma.checklistExecution.count({
    where: {
      ownerEmail: { equals: ownerEmail, mode: 'insensitive' },
      templateId,
      routineTaskNumber: { not: null },
      status: { in: ACTIVE_STATUSES },
    },
  });
}

async function listActiveRtAsc(prisma, ownerEmail, templateId) {
  return prisma.checklistExecution.findMany({
    where: {
      ownerEmail: { equals: ownerEmail, mode: 'insensitive' },
      templateId,
      routineTaskNumber: { not: null },
      status: { in: ACTIVE_STATUSES },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, createdAt: true, routineTaskNumber: true },
  });
}

/**
 * Garante até `mobilePrefetchSlots` execuções RT não terminais (PENDING em fila + uma em curso).
 */
async function ensureRoutineTaskMobileBuffer(prisma, assignment) {
  const slots = clampSlots(assignment.mobilePrefetchSlots);
  const user = await prisma.user.findUnique({
    where: { id: assignment.userId },
    select: { email: true },
  });
  const email = String(user?.email || '').trim();
  if (!email || !assignment.templateId) return { created: 0, slots };

  const tpl = await prisma.checklistTemplate.findUnique({
    where: { id: assignment.templateId },
    select: { title: true, description: true, tenantId: true },
  });
  // Modelos globais têm template.tenantId null; o tenant efetivo vem da associação (prestador).
  if (!tpl) return { created: 0, slots };

  let created = 0;
  let guard = 0;
  while ((await countActiveRtForTemplate(prisma, email, assignment.templateId)) < slots && guard < MAX_SLOTS * 3) {
    guard += 1;
    const q = await consumeQuota(prisma, assignment.tenantId, 'ROUTINE_TASK', 1);
    if (!q.ok) {
      break;
    }
    const rt = await allocateNextRtNumber(prisma);
    const meta = {
      ...routineTaskMetadataFromTemplate(tpl, assignment.templateId, { menuLabel: assignment.menuLabel }),
      rtMobileBuffer: true,
    };
    await prisma.checklistExecution.create({
      data: {
        routineTaskNumber: rt,
        templateId: assignment.templateId,
        ownerEmail: email,
        status: 'PENDING',
        responses: null,
        metadata: meta,
      },
      select: { id: true, routineTaskNumber: true },
    });
    created += 1;
  }

  /** RT não envia push (os_dispatched): o prestador vê a fila no menu radial — evita alertas no telemóvel. */

  return { created, slots };
}

/**
 * Reduz fila: cancela PENDING excedentes (mais recentes primeiro), mantendo as `slots` execuções mais antigas.
 */
async function cancelExcessRoutineBuffers(prisma, assignment) {
  const slots = clampSlots(assignment.mobilePrefetchSlots);
  const user = await prisma.user.findUnique({
    where: { id: assignment.userId },
    select: { email: true },
  });
  const email = String(user?.email || '').trim();
  if (!email || !assignment.templateId) return { cancelled: 0 };

  const rows = await listActiveRtAsc(prisma, email, assignment.templateId);
  if (rows.length <= slots) return { cancelled: 0 };

  const tail = rows.slice(slots);
  let cancelled = 0;
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const row = tail[i];
    const st = String(row.status || '').toUpperCase();
    if (st !== 'PENDING') continue;
    await prisma.checklistExecution.update({
      where: { id: row.id },
      data: { status: 'CANCELLED' },
    });
    cancelled += 1;
  }
  return { cancelled };
}

async function reconcileRoutineBuffersForAssignment(prisma, assignment) {
  await cancelExcessRoutineBuffers(prisma, assignment);
  return ensureRoutineTaskMobileBuffer(prisma, assignment);
}

/** Ao remover associação RT: cancela todas as execuções RT ativas desse modelo para o prestador. */
async function cancelActiveRoutinesForAssignmentRemoval(prisma, assignment) {
  const user = await prisma.user.findUnique({
    where: { id: assignment.userId },
    select: { email: true },
  });
  const email = String(user?.email || '').trim();
  if (!email || !assignment.templateId) return 0;
  const r = await prisma.checklistExecution.updateMany({
    where: {
      ownerEmail: { equals: email, mode: 'insensitive' },
      templateId: assignment.templateId,
      routineTaskNumber: { not: null },
      status: { in: ACTIVE_STATUSES },
    },
    data: { status: 'CANCELLED' },
  });
  return r.count;
}

module.exports = {
  MIN_SLOTS,
  MAX_SLOTS,
  clampSlots,
  ACTIVE_STATUSES,
  ensureRoutineTaskMobileBuffer,
  cancelExcessRoutineBuffers,
  reconcileRoutineBuffersForAssignment,
  cancelActiveRoutinesForAssignmentRemoval,
  listActiveRtAsc,
  countActiveRtForTemplate,
};
