'use strict';

const express = require('express');
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');
const { classifyTotal } = require('../lib/evaluationConstants');
const { pushToUserById } = require('../lib/evaluationPush');
const { newPublicTokenFields } = require('../lib/evaluationTrigger');
const { buildClientSurveyLinks } = require('../lib/evaluationSurveyUrl');
const { buildChatTranscriptForEvaluationInstance } = require('../lib/disputeChatTranscript');
const { extractClientEmailFromMetadata } = require('../lib/technicianClientChatGate');
const { sendTransactionalEmailWithFallback } = require('../lib/transactionalEmailSend');
const { resolveActiveUserIdsForDispatchOwnerEmail } = require('../lib/userEmailUnique');

const router = express.Router();

const QUESTION_TYPES = ['RATING', 'NPS', 'BOOLEAN', 'TEXT', 'MULTIPLE_CHOICE'];

function normalizeSurveyBranding(body) {
  const u = body?.surveyLogoUrl;
  const surveyLogoUrl =
    u != null && String(u).trim() !== '' ? String(u).trim().slice(0, 2048) : null;
  const pre = body?.surveyMessagePre;
  const surveyMessagePre =
    pre != null && String(pre).trim() !== '' ? String(pre).slice(0, 12000) : null;
  const post = body?.surveyMessagePost;
  const surveyMessagePost =
    post != null && String(post).trim() !== '' ? String(post).slice(0, 12000) : null;
  return { surveyLogoUrl, surveyMessagePre, surveyMessagePost };
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Apenas para atributo href (URLs) — não usar escHtml que codifica &. */
function escHrefAttr(url) {
  return String(url ?? '').replace(/"/g, '&quot;');
}

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

    const branding = normalizeSurveyBranding(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const tpl = await tx.evaluationTemplate.create({
        data: {
          tenantId,
          name: String(name).trim(),
          type,
          active: active !== false,
          triggerRules: req.body.triggerRules || {},
          ...branding,
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
        ...auditActor(req),
        tenantId,
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

/**
 * Pré-visualização autenticada: mesmo formato que GET /evaluations/public/form (sem token real).
 */
router.get('/templates/:id/preview-form', async (req, res) => {
  try {
    const { id } = req.params;
    const t = await prisma.evaluationTemplate.findUnique({
      where: { id },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!t) return res.status(404).json({ error: 'Template não encontrado.' });

    const questions = (t.questions || []).map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      required: q.required,
      options: q.options,
      sortOrder: q.sortOrder,
    }));

    res.json({
      previewMode: true,
      instanceId: 'preview',
      templateName: t.name || 'Avaliação',
      osNumber: null,
      expiresAt: null,
      questions,
      surveyLogoUrl: t.surveyLogoUrl || null,
      surveyMessagePre: t.surveyMessagePre || null,
      surveyMessagePost: t.surveyMessagePost || null,
    });
  } catch (err) {
    console.error('admin GET templates/:id/preview-form', err);
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

    const hasBranding =
      req.body &&
      ('surveyLogoUrl' in req.body ||
        'surveyMessagePre' in req.body ||
        'surveyMessagePost' in req.body);
    const branding = hasBranding ? normalizeSurveyBranding(req.body) : null;

    const fresh = await prisma.$transaction(async (tx) => {
      await tx.evaluationTemplate.update({
        where: { id },
        data: {
          ...(name != null ? { name: String(name).trim() } : {}),
          ...(active != null ? { active: !!active } : {}),
          ...(triggerRules != null ? { triggerRules } : {}),
          ...(branding
            ? {
                surveyLogoUrl: branding.surveyLogoUrl,
                surveyMessagePre: branding.surveyMessagePre,
                surveyMessagePost: branding.surveyMessagePost,
              }
            : {}),
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
        ...auditActor(req),
        tenantId: existing.tenantId,
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
        tenant: { select: { name: true } },
        execution: { select: { osNumber: true, metadata: true } },
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
        const clientEmailGuess = extractClientEmailFromMetadata(r.execution?.metadata);
        return {
          id: r.id,
          tenantId: r.tenantId,
          status: r.status,
          createdAt: r.createdAt,
          templateName: r.template?.name,
          tenantName: r.tenant?.name,
          technicianEmail: r.technician?.email,
          technicianName: r.technician?.name,
          osNumber: r.execution?.osNumber,
          score: r.score,
          publicToken: tok,
          publicTokenExpiresAt: pending ? r.publicTokenExpiresAt : null,
          clientSurveyFullUrl: links.fullUrl,
          clientSurveyRelativePath: links.relativePath,
          clientEmailGuess,
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
        ...auditActor(req),
        tenantId: inst.tenantId,
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

/**
 * Convida o cliente a responder a pesquisa: e-mail (transacional) e/ou push no app (utilizador USER com mesmo e-mail).
 * WhatsApp/SMS: reservado para integração futura (não implementado).
 */
router.post('/instances/:id/notify', express.json(), async (req, res) => {
  try {
    const rawCh = req.body?.channels;
    const channels = Array.isArray(rawCh)
      ? rawCh.map((c) => String(c).toLowerCase())
      : ['email'];
    const wantEmail = channels.includes('email');
    const wantPush = channels.includes('push');
    if (!wantEmail && !wantPush) {
      return res.status(400).json({ error: 'Indique pelo menos um canal: email ou push.' });
    }

    const emailOverride =
      typeof req.body?.emailTo === 'string' && String(req.body.emailTo).trim()
        ? String(req.body.emailTo).trim().toLowerCase()
        : null;

    const inst = await prisma.evaluationInstance.findUnique({
      where: { id: req.params.id },
      include: {
        execution: { select: { osNumber: true, metadata: true } },
        template: { select: { name: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!inst) return res.status(404).json({ error: 'Instância não encontrada.' });
    if (inst.status !== 'PENDING' || !inst.publicToken) {
      return res.status(400).json({ error: 'Só é possível convidar enquanto a avaliação estiver pendente e com link ativo.' });
    }

    const links = buildClientSurveyLinks(inst.publicToken);
    const surveyUrl = links.fullUrl;
    if (!surveyUrl) {
      return res.status(503).json({
        error:
          'URL pública do formulário não configurada. Defina ADMIN_PANEL_PUBLIC_BASE_URL no servidor (pasta onde está evaluation-survey.html, sem barra no final).',
      });
    }

    const fromMeta = extractClientEmailFromMetadata(inst.execution?.metadata);
    const targetEmail = emailOverride || fromMeta;
    const results = { email: null, push: null };

    const osLabel = inst.execution?.osNumber != null ? String(inst.execution.osNumber) : '—';
    const tenantLabel = inst.tenant?.name || 'Aria';
    const tplName = inst.template?.name || 'Avaliação de serviço';

    if (wantEmail) {
      if (!targetEmail || !targetEmail.includes('@')) {
        return res.status(400).json({
          error:
            'E-mail do cliente não encontrado na OS. Preencha o campo de e-mail no convite ou complete o despacho da OS com o e-mail do cliente.',
        });
      }
      const subject = `${tenantLabel} — Avalie o atendimento (OS ${osLabel})`;
      const text = [
        `Olá,`,
        ``,
        `Convidamo-lo a avaliar o serviço (${tplName}). Ordem de serviço: ${osLabel}.`,
        `Abra o link no telemóvel ou computador:`,
        surveyUrl,
        ``,
        `Obrigado,`,
        tenantLabel,
      ].join('\n');
      const html = `<p>Olá,</p>
<p>Convidamo-lo a avaliar o serviço <strong>${escHtml(tplName)}</strong>. Ordem de serviço: <strong>${escHtml(
        osLabel,
      )}</strong>.</p>
<p><a href="${escHrefAttr(surveyUrl)}">Responder avaliação</a></p>
<p style="font-size:12px;color:#64748b">Se o botão não funcionar, copie e cole este endereço no navegador:<br/>${escHtml(
        surveyUrl,
      )}</p>`;

      const sent = await sendTransactionalEmailWithFallback({
        to: targetEmail,
        subject,
        text,
        html,
      });
      const ok = !!(sent.send && sent.send.ok);
      results.email = {
        ok,
        provider: sent.provider,
        to: targetEmail,
        error: ok ? null : sent.send?.error || sent.send?.reason || 'Falha ao enviar e-mail.',
      };
      if (!ok) {
        return res.status(502).json({
          error: results.email.error || 'Não foi possível enviar o e-mail (verifique MailerSend/Nylas no servidor).',
          results,
        });
      }
    }

    if (wantPush) {
      const pushEmail = targetEmail;
      if (!pushEmail || !pushEmail.includes('@')) {
        results.push = {
          skipped: true,
          reason:
            'É necessário um e-mail para localizar o cliente na app. Use o e-mail detetado na OS ou preencha o campo no convite.',
        };
      } else {
        const clientUserIds = await resolveActiveUserIdsForDispatchOwnerEmail(prisma, pushEmail, {
          tenantId: inst.tenantId,
        });
        const clientUser = clientUserIds.length ? await prisma.user.findFirst({
          where: { id: { in: clientUserIds }, role: 'USER', isActive: true },
          select: { id: true },
          orderBy: { updatedAt: 'desc' },
        }) : null;
        if (!clientUser) {
          results.push = {
            skipped: true,
            reason:
              'Não existe utilizador «cliente» (app) com este e-mail neste tenant. O cliente pode responder pelo link enviado por e-mail ou partilhado manualmente.',
          };
        } else {
          await pushToUserById(clientUser.id, {
            title: `${tenantLabel} — Avalie o serviço`,
            body: `Toque para responder à avaliação da OS ${osLabel}.`,
            data: {
              type: 'EVALUATION_CLIENT_SURVEY_INVITE',
              evaluationInstanceId: inst.id,
              surveyUrl,
              publicToken: inst.publicToken,
            },
          });
          results.push = { ok: true, userId: clientUser.id };
        }
      }
    }

    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        tenantId: inst.tenantId,
        action: 'EVALUATION_INSTANCE_CLIENT_NOTIFY',
        resource: inst.id,
        category: 'DATA',
        metadata: {
          channels: { email: wantEmail, push: wantPush },
          emailTo: wantEmail ? targetEmail : null,
          pushSkipped: results.push && results.push.skipped,
        },
      },
    });

    res.json({ ok: true, results, surveyUrl, clientEmailUsed: targetEmail || null });
  } catch (err) {
    console.error('admin POST instances/:id/notify', err);
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
        ...auditActor(req),
        tenantId: dispute.tenantId,
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

/** Transcrição do chat técnico–cliente para auditoria de disputas (painel admin). */
router.get('/disputes/:disputeId/chat-transcript', async (req, res) => {
  try {
    const dispute = await prisma.evaluationDispute.findUnique({
      where: { id: req.params.disputeId },
      select: { id: true, tenantId: true, instanceId: true },
    });
    if (!dispute) return res.status(404).json({ error: 'Disputa não encontrada.' });
    const data = await buildChatTranscriptForEvaluationInstance(dispute.instanceId);
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        tenantId: dispute.tenantId,
        action: 'EVALUATION_DISPUTE_CHAT_TRANSCRIPT',
        resource: dispute.instanceId,
        category: 'DATA',
        metadata: {
          disputeId: dispute.id,
          messageCount: data.messages.length,
          roomId: data.roomId,
        },
      },
    });
    res.json(data);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('admin GET disputes/:id/chat-transcript', err);
    res.status(500).json({ error: err.message });
  }
});

/** Mesmo conteúdo que por disputa, mas a partir da instância (ex.: separador Instâncias). */
router.get('/instances/:instanceId/chat-transcript', async (req, res) => {
  try {
    const inst = await prisma.evaluationInstance.findUnique({
      where: { id: req.params.instanceId },
      select: { id: true, tenantId: true },
    });
    if (!inst) return res.status(404).json({ error: 'Instância não encontrada.' });
    const data = await buildChatTranscriptForEvaluationInstance(inst.id);
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        tenantId: inst.tenantId,
        action: 'EVALUATION_INSTANCE_CHAT_TRANSCRIPT',
        resource: inst.id,
        category: 'DATA',
        metadata: { messageCount: data.messages.length, roomId: data.roomId },
      },
    });
    res.json(data);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('admin GET instances/:id/chat-transcript', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
