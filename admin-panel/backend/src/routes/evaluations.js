'use strict';

const express = require('express');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { classifyTotal } = require('../lib/evaluationConstants');
const { buildInsights } = require('../lib/evaluationInsights');
const { pushToUserById } = require('../lib/evaluationPush');
const { buildClientSurveyLinks } = require('../lib/evaluationSurveyUrl');

const router = express.Router();

function isManagerRole(role) {
  return role === 'MANAGER' || role === 'ADMIN';
}

async function writeAudit(tenantId, userId, action, resource, metadata) {
  await prisma.auditLog.create({
    data: {
      tenantId: tenantId || undefined,
      userId: userId || undefined,
      action,
      resource: String(resource).slice(0, 500),
      category: 'DATA',
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    },
  });
}

router.get('/me/summary', authUser, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const technicianUserId = req.user.id;

    const withScore = await prisma.evaluationInstance.findMany({
      where: {
        tenantId,
        technicianUserId,
        status: { in: ['RESPONDED', 'IN_REVIEW', 'FINALIZED'] },
        score: { isNot: null },
      },
      include: {
        score: true,
        acknowledgements: { where: { userId: technicianUserId } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const scored = withScore.filter((i) => i.score);
    const avg =
      scored.length > 0
        ? scored.reduce((a, i) => a + i.score.totalScore, 0) / scored.length
        : null;

    const half = Math.max(1, Math.floor(scored.length / 2));
    const recent = scored.slice(0, half);
    const older = scored.slice(half, half * 2);
    const avgRecent =
      recent.length > 0 ? recent.reduce((a, i) => a + i.score.totalScore, 0) / recent.length : null;
    const avgOlder =
      older.length > 0 ? older.reduce((a, i) => a + i.score.totalScore, 0) / older.length : null;
    let trend = 'flat';
    if (avgRecent != null && avgOlder != null) {
      if (avgRecent > avgOlder + 2) trend = 'up';
      else if (avgRecent < avgOlder - 2) trend = 'down';
    }

    const catKeys = ['qualidade', 'prazo', 'atendimento'];
    const categoryAverages = {};
    for (const k of catKeys) {
      const vals = [];
      for (const i of scored) {
        const sc = i.score.scoreByCategory;
        if (sc && typeof sc === 'object' && k in sc && Number.isFinite(Number(sc[k]))) {
          vals.push(Number(sc[k]));
        }
      }
      categoryAverages[k] =
        vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }

    const critical = scored.filter((i) => i.score.classification === 'CRITICAL');
    const criticalPendingAck = critical.filter((i) => i.acknowledgements.length === 0);

    res.json({
      averageTotal: avg != null ? Math.round(avg * 10) / 10 : null,
      trend,
      categoryAverages,
      criticalCount: critical.length,
      criticalPendingAckCount: criticalPendingAck.length,
      respondedCount: scored.length,
    });
  } catch (err) {
    console.error('GET /evaluations/me/summary', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/instances', authUser, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const technicianUserId = req.user.id;
    const sort = String(req.query.sort || 'critical').toLowerCase();

    const list = await prisma.evaluationInstance.findMany({
      where: { tenantId, technicianUserId },
      include: {
        template: { select: { id: true, name: true, type: true } },
        score: true,
        acknowledgements: { where: { userId: technicianUserId } },
        execution: { select: { id: true, osNumber: true, completedAt: true, startedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const classOrder = { CRITICAL: 0, GOOD: 1, EXCELLENT: 2 };
    const statusOrder = { PENDING: 3, IN_REVIEW: 1, RESPONDED: 2, FINALIZED: 2 };

    const sorted = [...list].sort((a, b) => {
      const ca = a.score?.classification || 'GOOD';
      const cb = b.score?.classification || 'GOOD';
      if (sort === 'positive') {
        return (classOrder[cb] ?? 9) - (classOrder[ca] ?? 9);
      }
      if (sort === 'neutral') {
        const pa = ca === 'GOOD' ? 0 : 1;
        const pb = cb === 'GOOD' ? 0 : 1;
        if (pa !== pb) return pa - pb;
      } else {
        // critical first
        const pa = classOrder[ca] ?? 9;
        const pb = classOrder[cb] ?? 9;
        if (pa !== pb) return pa - pb;
      }
      const sa = statusOrder[a.status] ?? 9;
      const sb = statusOrder[b.status] ?? 9;
      if (sa !== sb) return sa - sb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      items: sorted.map((i) => {
        const needsAck =
          i.score?.classification === 'CRITICAL' && (i.acknowledgements?.length ?? 0) === 0;
        const survey =
          i.status === 'PENDING' && i.publicToken ? buildClientSurveyLinks(i.publicToken) : null;
        return {
          id: i.id,
          status: i.status,
          createdAt: i.createdAt,
          template: i.template,
          osNumber: i.execution?.osNumber || null,
          executionId: i.executionId,
          needsAck,
          ...(survey?.fullUrl ? { clientSurveyFullUrl: survey.fullUrl } : {}),
          score: i.score
            ? {
                totalScore: i.score.totalScore,
                classification: i.score.classification,
              }
            : null,
        };
      }),
    });
  } catch (err) {
    console.error('GET /evaluations/me/instances', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/instances/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const inst = await prisma.evaluationInstance.findFirst({
      where: {
        id,
        tenantId: req.user.tenantId,
        technicianUserId: req.user.id,
      },
      include: {
        template: { select: { id: true, name: true, type: true } },
        score: true,
        acknowledgements: { where: { userId: req.user.id } },
        internalNotes: { orderBy: { createdAt: 'desc' }, take: 50 },
        actionPlans: { orderBy: { createdAt: 'desc' } },
        disputes: { orderBy: { createdAt: 'desc' } },
        execution: {
          include: {
            template: { select: { title: true } },
          },
        },
      },
    });
    if (!inst) return res.status(404).json({ error: 'Avaliação não encontrada.' });

    const ex = inst.execution;
    let durationMinutes = null;
    if (ex?.startedAt && ex?.completedAt) {
      durationMinutes = Math.round((new Date(ex.completedAt) - new Date(ex.startedAt)) / 60000);
    }

    const needsAck =
      inst.score?.classification === 'CRITICAL' && inst.acknowledgements.length === 0;

    const insights =
      inst.insights ||
      (inst.score
        ? buildInsights({
            classification: inst.score.classification,
            totalScore: inst.score.totalScore,
            scoreByCategory: inst.score.scoreByCategory,
          })
        : null);

    const surveyLinks =
      inst.status === 'PENDING' && inst.publicToken
        ? buildClientSurveyLinks(inst.publicToken)
        : { relativePath: null, fullUrl: null };

    res.json({
      instance: {
        id: inst.id,
        status: inst.status,
        createdAt: inst.createdAt,
        displayText: inst.displayText,
        template: inst.template,
        targetType: inst.targetType,
        insights,
        clientSurveyRelativePath: surveyLinks.relativePath,
        clientSurveyFullUrl: surveyLinks.fullUrl,
      },
      context: {
        osNumber: ex?.osNumber || null,
        serviceTitle: ex?.template?.title || null,
        assetTitle: null,
        startedAt: ex?.startedAt || null,
        completedAt: ex?.completedAt || null,
        durationMinutes,
      },
      score: inst.score,
      needsAck,
      internalNotes: inst.internalNotes,
      actionPlans: inst.actionPlans,
      disputes: inst.disputes,
    });
  } catch (err) {
    console.error('GET /evaluations/instances/:id', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/instances/:id/acknowledge', authUser, async (req, res) => {
  try {
    const inst = await prisma.evaluationInstance.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        technicianUserId: req.user.id,
      },
    });
    if (!inst) return res.status(404).json({ error: 'Avaliação não encontrada.' });

    const ack = await prisma.evaluationAcknowledgement.upsert({
      where: {
        instanceId_userId: { instanceId: inst.id, userId: req.user.id },
      },
      create: {
        instanceId: inst.id,
        userId: req.user.id,
      },
      update: {},
    });

    await writeAudit(req.user.tenantId, req.user.id, 'EVALUATION_ACK', inst.id, {
      instanceId: inst.id,
    });
    res.json({ ok: true, id: ack.id });
  } catch (err) {
    console.error('POST acknowledge', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/instances/:id/internal-notes', authUser, async (req, res) => {
  try {
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ error: 'Texto obrigatório.' });

    const inst = await prisma.evaluationInstance.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        technicianUserId: req.user.id,
      },
    });
    if (!inst) return res.status(404).json({ error: 'Avaliação não encontrada.' });

    const note = await prisma.evaluationInternalNote.create({
      data: {
        instanceId: inst.id,
        userId: req.user.id,
        body,
      },
    });
    await writeAudit(req.user.tenantId, req.user.id, 'EVALUATION_INTERNAL_NOTE', inst.id, {
      instanceId: inst.id,
      noteId: note.id,
    });
    res.status(201).json(note);
  } catch (err) {
    console.error('POST internal-notes', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/instances/:id/disputes', authUser, async (req, res) => {
  try {
    const justification =
      typeof req.body.justification === 'string' ? req.body.justification.trim() : '';
    if (justification.length < 10) {
      return res.status(400).json({ error: 'Justificativa deve ter ao menos 10 caracteres.' });
    }

    const inst = await prisma.evaluationInstance.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        technicianUserId: req.user.id,
      },
      include: { disputes: { where: { status: 'PENDING' } } },
    });
    if (!inst) return res.status(404).json({ error: 'Avaliação não encontrada.' });
    if (inst.disputes.length > 0) {
      return res.status(409).json({ error: 'Já existe uma revisão pendente.' });
    }

    const dispute = await prisma.$transaction(async (tx) => {
      const d = await tx.evaluationDispute.create({
        data: {
          tenantId: inst.tenantId,
          instanceId: inst.id,
          technicianUserId: req.user.id,
          justification,
        },
      });
      await tx.evaluationInstance.update({
        where: { id: inst.id },
        data: { status: 'IN_REVIEW' },
      });
      return d;
    });

    await writeAudit(req.user.tenantId, req.user.id, 'EVALUATION_DISPUTE_OPEN', inst.id, {
      instanceId: inst.id,
      disputeId: dispute.id,
    });
    res.status(201).json(dispute);
  } catch (err) {
    console.error('POST disputes', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/instances/:id/action-plans', authUser, async (req, res) => {
  try {
    const description =
      typeof req.body.description === 'string' ? req.body.description.trim() : '';
    if (!description) return res.status(400).json({ error: 'Descrição obrigatória.' });

    const inst = await prisma.evaluationInstance.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        technicianUserId: req.user.id,
      },
    });
    if (!inst) return res.status(404).json({ error: 'Avaliação não encontrada.' });

    const plan = await prisma.evaluationActionPlan.create({
      data: {
        tenantId: inst.tenantId,
        instanceId: inst.id,
        technicianUserId: req.user.id,
        description,
      },
    });
    await writeAudit(req.user.tenantId, req.user.id, 'EVALUATION_ACTION_PLAN_CREATE', inst.id, {
      planId: plan.id,
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error('POST action-plans', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/action-plans/:planId', authUser, async (req, res) => {
  try {
    const status = String(req.body.status || '').toUpperCase();
    if (!['OPEN', 'IN_PROGRESS', 'DONE'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const plan = await prisma.evaluationActionPlan.findFirst({
      where: {
        id: req.params.planId,
        tenantId: req.user.tenantId,
        technicianUserId: req.user.id,
      },
    });
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado.' });

    const updated = await prisma.evaluationActionPlan.update({
      where: { id: plan.id },
      data: { status },
    });
    await writeAudit(req.user.tenantId, req.user.id, 'EVALUATION_ACTION_PLAN_UPDATE', plan.instanceId, {
      planId: plan.id,
      status,
    });
    res.json(updated);
  } catch (err) {
    console.error('PATCH action-plans', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Gestor resolve disputa: MAINTAIN_EVAL | ADJUSTED | INVALIDATED
 */
router.patch('/disputes/:disputeId', authUser, async (req, res) => {
  try {
    if (!isManagerRole(req.user.role)) {
      return res.status(403).json({ error: 'Apenas gestores podem resolver revisões.' });
    }

    const status = String(req.body.status || '').toUpperCase();
    if (!['MAINTAIN_EVAL', 'ADJUSTED', 'INVALIDATED'].includes(status)) {
      return res.status(400).json({ error: 'status deve ser MAINTAIN_EVAL, ADJUSTED ou INVALIDATED.' });
    }

    const resolutionNote =
      typeof req.body.resolutionNote === 'string' ? req.body.resolutionNote.trim() : '';
    const adjustedTotalScore = req.body.adjustedTotalScore;

    const dispute = await prisma.evaluationDispute.findFirst({
      where: {
        id: req.params.disputeId,
        tenantId: req.user.tenantId,
        status: 'PENDING',
      },
      include: {
        instance: {
          include: {
            score: true,
            template: { include: { questions: true } },
          },
        },
      },
    });
    if (!dispute) return res.status(404).json({ error: 'Disputa não encontrada ou já resolvida.' });

    await prisma.$transaction(async (tx) => {
      await tx.evaluationDispute.update({
        where: { id: dispute.id },
        data: {
          status,
          supervisorId: req.user.id,
          resolutionNote: resolutionNote || null,
          adjustedTotalScore:
            status === 'ADJUSTED' && Number.isFinite(Number(adjustedTotalScore))
              ? Number(adjustedTotalScore)
              : null,
        },
      });

      if (status === 'MAINTAIN_EVAL') {
        await tx.evaluationInstance.update({
          where: { id: dispute.instanceId },
          data: { status: 'RESPONDED' },
        });
      } else if (status === 'ADJUSTED' && dispute.instance.score) {
        const newTotal = Number(adjustedTotalScore);
        if (!Number.isFinite(newTotal)) {
          throw new Error('adjustedTotalScore obrigatório para ADJUSTED.');
        }
        await tx.evaluationScore.update({
          where: { instanceId: dispute.instanceId },
          data: {
            totalScore: newTotal,
            classification: classifyTotal(newTotal),
          },
        });
        await tx.evaluationInstance.update({
          where: { id: dispute.instanceId },
          data: { status: 'RESPONDED' },
        });
      } else if (status === 'INVALIDATED') {
        await tx.evaluationScore.deleteMany({ where: { instanceId: dispute.instanceId } });
        await tx.evaluationResponse.deleteMany({ where: { instanceId: dispute.instanceId } });
        await tx.evaluationInstance.update({
          where: { id: dispute.instanceId },
          data: { status: 'FINALIZED', displayText: null, rawClientText: null, insights: null },
        });
      }
    });

    await writeAudit(req.user.tenantId, req.user.id, 'EVALUATION_DISPUTE_RESOLVED', dispute.instanceId, {
      disputeId: dispute.id,
      outcome: status,
    });

    await pushToUserById(dispute.instance.technicianUserId, {
      title: 'Decisão de revisão',
      body: `A sua solicitação de revisão foi analisada (${status}).`,
      data: {
        type: 'EVALUATION_DISPUTE_RESOLVED',
        evaluationInstanceId: dispute.instanceId,
      },
    });

    const fresh = await prisma.evaluationDispute.findUnique({ where: { id: dispute.id } });
    res.json(fresh);
  } catch (err) {
    console.error('PATCH disputes', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
