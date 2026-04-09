'use strict';

const express = require('express');
const prisma = require('../db');
const { classifyTotal } = require('../lib/evaluationConstants');
const { pushToUserById } = require('../lib/evaluationPush');
const { newPublicTokenFields } = require('../lib/evaluationTrigger');
const { buildClientSurveyLinks } = require('../lib/evaluationSurveyUrl');

const router = express.Router();

const QUESTION_TYPES = ['RATING', 'NPS', 'BOOLEAN', 'TEXT', 'MULTIPLE_CHOICE'];

/**
 * Sincroniza perguntas do template: atualiza por id, cria novas, remove as que saíram do payload
 * (só remove se não existirem respostas em instâncias).
 */
async function syncTemplateQuestions(tx, templateId, questions) {
  if (!Array.isArray(questions)) return;
  const existingQs = await tx.evaluationTemplateQuestion.findMany({ where: { templateId } });
  const byId = new Map(existingQs.map((q) => [q.id, q]));
  const stillUsed = new Set();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const text = String(q.text || '').trim() || 'Pergunta';
    const type = QUESTION_TYPES.includes(String(q.type || '').toUpperCase())
      ? String(q.type).toUpperCase()
      : 'RATING';
    const sortOrder = Number.isFinite(Number(q.sortOrder)) ? Number(q.sortOrder) : i;
    const weight = Number(q.weight) > 0 ? Number(q.weight) : 1;
    const required = q.required !== false;
    const categoryKey =
      q.categoryKey != null && String(q.categoryKey).trim() !== '' ? String(q.categoryKey).trim() : null;
    const options = q.options != null && typeof q.options === 'object' ? q.options : undefined;

    if (q.id && byId.has(String(q.id))) {
      const qid = String(q.id);
      stillUsed.add(qid);
      await tx.evaluationTemplateQuestion.update({
        where: { id: qid },
        data: { text, type, weight, required, categoryKey, sortOrder, options },
      });
    } else {
      await tx.evaluationTemplateQuestion.create({
        data: {
          templateId,
          text,
          type,
          weight,
          required,
          categoryKey,
          sortOrder,
          options,
        },
      });
    }
  }

  for (const eq of existingQs) {
    if (stillUsed.has(eq.id)) continue;
    const n = await tx.evaluationResponse.count({ where: { questionId: eq.id } });
    if (n > 0) {
      throw new Error(
        `Não é possível remover a pergunta «${String(eq.text).slice(0, 48)}»: já existem respostas de clientes.`
      );
    }
    await tx.evaluationTemplateQuestion.delete({ where: { id: eq.id } });
  }
}

router.get('/templates', async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
    const rows = await prisma.evaluationTemplate.findMany({
      where: tenantId ? { tenantId } : {},
      include: {
        tenant: { select: { name: true, email: true } },
        _count: { select: { questions: true, instances: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });
    res.json(rows);
  } catch (err) {
    console.error('admin GET templates', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', express.json(), async (req, res) => {
  try {
    const { tenantId, name, type, active, questions } = req.body;
    if (!tenantId || !name || !type) {
      return res.status(400).json({ error: 'tenantId, name e type são obrigatórios.' });
    }
    const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) return res.status(404).json({ error: 'Tenant não encontrado.' });

    const created = await prisma.$transaction(async (tx) => {
      const tpl = await tx.evaluationTemplate.create({
        data: {
          tenantId,
          name: String(name).trim(),
          type,
          active: active !== false,
          triggerRules: req.body.triggerRules || {},
        },
      });
      const qs = Array.isArray(questions) ? questions : [];
      let order = 0;
      for (const q of qs) {
        await tx.evaluationTemplateQuestion.create({
          data: {
            templateId: tpl.id,
            text: String(q.text || '').trim() || 'Pergunta',
            type: q.type || 'RATING',
            weight: Number(q.weight) > 0 ? Number(q.weight) : 1,
            required: q.required !== false,
            options: q.options || undefined,
            categoryKey: q.categoryKey || null,
            sortOrder: Number.isFinite(Number(q.sortOrder)) ? Number(q.sortOrder) : order++,
          },
        });
      }
      return tpl;
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        adminId: req.admin.id,
        action: 'EVALUATION_TEMPLATE_CREATE',
        resource: created.id,
        category: 'DATA',
        metadata: { name: created.name },
      },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('admin POST templates', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const t = await prisma.evaluationTemplate.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, email: true } },
        questions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { instances: true } },
      },
    });
    if (!t) return res.status(404).json({ error: 'Template não encontrado.' });
    res.json(t);
  } catch (err) {
    console.error('admin GET template/:id', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/templates/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, active, triggerRules, questions } = req.body;
    const existing = await prisma.evaluationTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Template não encontrado.' });

    const fresh = await prisma.$transaction(async (tx) => {
      await tx.evaluationTemplate.update({
        where: { id },
        data: {
          ...(name != null ? { name: String(name).trim() } : {}),
          ...(active != null ? { active: !!active } : {}),
          ...(triggerRules != null ? { triggerRules } : {}),
        },
      });
      if (questions !== undefined) {
        await syncTemplateQuestions(tx, id, questions);
      }
      return tx.evaluationTemplate.findUnique({
        where: { id },
        include: {
          tenant: { select: { id: true, name: true, email: true } },
          questions: { orderBy: { sortOrder: 'asc' } },
          _count: { select: { instances: true } },
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        tenantId: existing.tenantId,
        adminId: req.admin.id,
        action: 'EVALUATION_TEMPLATE_UPDATE',
        resource: id,
        category: 'DATA',
        metadata: { questionsSynced: questions !== undefined },
      },
    });

    res.json(fresh);
  } catch (err) {
    console.error('admin PATCH templates', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/instances', async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const rows = await prisma.evaluationInstance.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        template: { select: { name: true } },
        technician: { select: { name: true, email: true } },
        execution: { select: { osNumber: true } },
        score: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({
      items: rows.map((r) => {
        const pending = r.status === 'PENDING';
        const tok = pending ? r.publicToken : null;
        const links = tok ? buildClientSurveyLinks(tok) : { relativePath: null, fullUrl: null };
        return {
          id: r.id,
          tenantId: r.tenantId,
          status: r.status,
          createdAt: r.createdAt,
          templateName: r.template?.name,
          technicianEmail: r.technician?.email,
          technicianName: r.technician?.name,
          osNumber: r.execution?.osNumber,
          score: r.score,
          publicToken: tok,
          publicTokenExpiresAt: pending ? r.publicTokenExpiresAt : null,
          clientSurveyFullUrl: links.fullUrl,
          clientSurveyRelativePath: links.relativePath,
        };
      }),
    });
  } catch (err) {
    console.error('admin GET instances', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/instances/:id/regenerate-token', async (req, res) => {
  try {
    const inst = await prisma.evaluationInstance.findUnique({ where: { id: req.params.id } });
    if (!inst) return res.status(404).json({ error: 'Instância não encontrada.' });
    if (inst.status !== 'PENDING') {
      return res.status(400).json({ error: 'Só é possível gerar link para avaliações pendentes.' });
    }
    const fields = newPublicTokenFields();
    const updated = await prisma.evaluationInstance.update({
      where: { id: inst.id },
      data: fields,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: inst.tenantId,
        adminId: req.admin.id,
        action: 'EVALUATION_PUBLIC_TOKEN_REGEN',
        resource: inst.id,
        category: 'DATA',
      },
    });
    res.json({ ok: true, publicToken: updated.publicToken, publicTokenExpiresAt: updated.publicTokenExpiresAt });
  } catch (err) {
    console.error('admin regenerate token', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/disputes', async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
    const statusQ = req.query.status != null && String(req.query.status).trim() !== ''
      ? String(req.query.status).toUpperCase()
      : 'PENDING';
    const rows = await prisma.evaluationDispute.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(statusQ && statusQ !== 'ALL' ? { status: statusQ } : {}),
      },
      include: {
        instance: {
          include: {
            template: { select: { name: true } },
            execution: { select: { osNumber: true } },
            score: true,
          },
        },
        technician: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ items: rows });
  } catch (err) {
    console.error('admin GET disputes', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/disputes/:disputeId/resolve', express.json(), async (req, res) => {
  try {
    const status = String(req.body.status || '').toUpperCase();
    if (!['MAINTAIN_EVAL', 'ADJUSTED', 'INVALIDATED'].includes(status)) {
      return res.status(400).json({ error: 'status inválido.' });
    }
    const resolutionNote =
      typeof req.body.resolutionNote === 'string' ? req.body.resolutionNote.trim() : '';
    const adjustedTotalScore = req.body.adjustedTotalScore;

    const dispute = await prisma.evaluationDispute.findFirst({
      where: { id: req.params.disputeId, status: 'PENDING' },
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
          supervisorId: null,
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
        if (!Number.isFinite(newTotal)) throw new Error('adjustedTotalScore obrigatório.');
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

    await prisma.auditLog.create({
      data: {
        tenantId: dispute.tenantId,
        adminId: req.admin.id,
        action: 'EVALUATION_DISPUTE_RESOLVED_ADMIN',
        resource: dispute.instanceId,
        category: 'DATA',
        metadata: { disputeId: dispute.id, outcome: status },
      },
    });

    await pushToUserById(dispute.instance.technicianUserId, {
      title: 'Decisão de revisão',
      body: `A revisão da avaliação foi concluída (${status}).`,
      data: {
        type: 'EVALUATION_DISPUTE_RESOLVED',
        evaluationInstanceId: dispute.instanceId,
      },
    });

    const fresh = await prisma.evaluationDispute.findUnique({ where: { id: dispute.id } });
    res.json(fresh);
  } catch (err) {
    console.error('admin PATCH disputes', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 90 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();

    const whereBase = {
      createdAt: { gte: from, lte: to },
      ...(tenantId ? { tenantId } : {}),
    };

    const instances = await prisma.evaluationInstance.findMany({
      where: whereBase,
      include: {
        score: true,
        technician: { select: { id: true, name: true, email: true } },
      },
    });

    let pending = 0;
    let responded = 0;
    let criticalN = 0;
    const scoreTotals = [];
    const perTech = {};

    for (const i of instances) {
      if (i.status === 'PENDING') pending += 1;
      if (['RESPONDED', 'IN_REVIEW', 'FINALIZED'].includes(i.status)) responded += 1;
      if (i.score) {
        scoreTotals.push(i.score.totalScore);
        if (i.score.classification === 'CRITICAL') criticalN += 1;
        const tid = i.technicianUserId;
        if (!perTech[tid]) perTech[tid] = { sum: 0, n: 0, name: i.technician?.name, email: i.technician?.email };
        perTech[tid].sum += i.score.totalScore;
        perTech[tid].n += 1;
      }
    }

    const avgTotal =
      scoreTotals.length > 0
        ? Math.round((scoreTotals.reduce((a, b) => a + b, 0) / scoreTotals.length) * 10) / 10
        : null;

    const ranking = Object.entries(perTech)
      .map(([id, v]) => ({
        technicianUserId: id,
        name: v.name || id,
        email: v.email,
        avgScore: Math.round((v.sum / v.n) * 10) / 10,
        count: v.n,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 50);

    const totalInst = instances.length;
    const responseRate =
      totalInst > 0
        ? Math.round((instances.filter((i) => i.status !== 'PENDING').length / totalInst) * 1000) / 10
        : null;

    res.json({
      period: { from, to },
      tenantId: tenantId || null,
      counts: {
        total: totalInst,
        pending,
        respondedOrOther: responded,
        scored: scoreTotals.length,
        critical: criticalN,
      },
      averageTotalScore: avgTotal,
      responseRatePercent: responseRate,
      technicianRanking: ranking,
    });
  } catch (err) {
    console.error('admin GET analytics', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
