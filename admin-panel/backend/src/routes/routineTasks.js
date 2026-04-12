'use strict';

const express = require('express');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { canReceiveFieldTasksForEmail } = require('../lib/technicianEligibility');
const { allocateNextRtNumber } = require('../lib/rtSerialNumber');
const { routineTaskMetadataFromTemplate } = require('../lib/routineTaskMetadata');
const {
  reconcileRoutineBuffersForAssignment,
  countActiveRtForTemplate,
  clampSlots,
  ACTIVE_STATUSES,
} = require('../lib/routineTaskMobileBuffer');

const router = express.Router();
router.use(authUser);

/**
 * GET /api/routine-tasks/me — modelos RT associados ao utilizador (prestador) + fila no servidor.
 */
router.get('/me', async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const email = String(req.user.email || '').trim();
    if (!tenantId || !email) {
      return res.status(400).json({ error: 'Sessão inválida.' });
    }
    const can = await canReceiveFieldTasksForEmail(prisma, email, tenantId);
    if (!can) {
      return res.json({ assignments: [] });
    }
    const rows = await prisma.routineTaskAssignment.findMany({
      where: { userId, tenantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        template: { select: { id: true, title: true, description: true, isActive: true } },
      },
    });

    const assignments = [];
    for (const r of rows) {
      if (!r.template || !r.template.isActive) continue;
      try {
        await reconcileRoutineBuffersForAssignment(prisma, r);
      } catch (e) {
        console.error('[routine-tasks/me] reconcile', r.templateId, e);
      }
      const activeCount = await countActiveRtForTemplate(prisma, email, r.templateId);
      const custom = r.menuLabel != null ? String(r.menuLabel).trim() : '';
      const fallback = r.template.title ? String(r.template.title).trim() : '';
      assignments.push({
        templateId: r.templateId,
        title: custom || fallback || 'Tarefa de rotina',
        menuLabel: custom || null,
        templateTitle: fallback || null,
        description: r.template.description || null,
        sortOrder: r.sortOrder,
        mobilePrefetchSlots: clampSlots(r.mobilePrefetchSlots ?? 1),
        rtActiveCount: activeCount,
      });
    }
    res.json({ assignments });
  } catch (err) {
    console.error('[routine-tasks/me]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/routine-tasks/open — usa a cabeça da fila (mais antiga) ou cria uma execução RT.
 * Body: { templateId }
 */
router.post('/open', express.json(), async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.user.tenantId;
    const email = String(req.user.email || '').trim();
    const templateId = req.body?.templateId != null ? String(req.body.templateId).trim() : '';
    if (!tenantId || !email || !templateId) {
      return res.status(400).json({ error: 'templateId é obrigatório.' });
    }
    const can = await canReceiveFieldTasksForEmail(prisma, email, tenantId);
    if (!can) {
      return res.status(403).json({ error: 'Esta conta não pode usar tarefas de rotina (apenas perfil de cliente).' });
    }
    const assign = await prisma.routineTaskAssignment.findFirst({
      where: { userId, tenantId, templateId },
      include: { template: true },
    });
    if (!assign || !assign.template || !assign.template.isActive) {
      return res.status(403).json({ error: 'Este formulário não está associado ao seu perfil como tarefa de rotina.' });
    }
    const tpl = assign.template;

    await reconcileRoutineBuffersForAssignment(prisma, assign);

    const head = await prisma.checklistExecution.findFirst({
      where: {
        ownerEmail: { equals: email, mode: 'insensitive' },
        templateId,
        routineTaskNumber: { not: null },
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        routineTaskNumber: true,
        templateId: true,
        status: true,
      },
    });

    if (head?.routineTaskNumber) {
      const st = String(head.status || '').toUpperCase();
      const activatedFromQueue = st === 'PENDING' || st === 'RECEIVED';
      if (activatedFromQueue) {
        await prisma.checklistExecution.update({
          where: { id: head.id },
          data: {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
          },
        });
      }
      return res.json({
        executionId: head.id,
        routineTaskNumber: head.routineTaskNumber,
        templateId: head.templateId,
        reused: !activatedFromQueue,
      });
    }

    const rt = await allocateNextRtNumber(prisma);
    const meta = routineTaskMetadataFromTemplate(tpl, templateId, { menuLabel: assign.menuLabel });
    const created = await prisma.checklistExecution.create({
      data: {
        routineTaskNumber: rt,
        templateId,
        ownerEmail: email,
        status: 'IN_PROGRESS',
        responses: null,
        startedAt: new Date(),
        metadata: meta,
      },
      select: { id: true, routineTaskNumber: true, templateId: true },
    });
    res.status(201).json({
      executionId: created.id,
      routineTaskNumber: created.routineTaskNumber,
      templateId: created.templateId,
      reused: false,
    });
  } catch (err) {
    console.error('[routine-tasks/open]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
