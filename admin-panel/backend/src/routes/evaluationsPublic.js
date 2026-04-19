'use strict';

const express = require('express');
const prisma = require('../db');
const { submitClientEvaluationByToken } = require('../lib/evaluationClientSubmit');

const router = express.Router();

/**
 * GET /api/evaluations/public/form?token=
 * Formulário público (sem JWT).
 */
router.get('/form', async (req, res) => {
  try {
    const token = String(req.query.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token é obrigatório.' });

    const full = await prisma.evaluationInstance.findFirst({
      where: {
        publicToken: token,
        status: 'PENDING',
        publicTokenExpiresAt: { gt: new Date() },
      },
      include: {
        template: { include: { questions: { orderBy: { sortOrder: 'asc' } } } },
        execution: { select: { osNumber: true } },
      },
    });

    if (!full) {
      return res.status(404).json({ error: 'Link inválido ou já utilizado.' });
    }

    const questions = (full.template.questions || []).map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      required: q.required,
      options: q.options,
      sortOrder: q.sortOrder,
    }));

    const tpl = full.template;
    res.json({
      instanceId: full.id,
      templateName: tpl?.name || 'Avaliação',
      osNumber: full.execution?.osNumber || null,
      expiresAt: full.publicTokenExpiresAt,
      questions,
      surveyLogoUrl: tpl?.surveyLogoUrl || null,
      surveyMessagePre: tpl?.surveyMessagePre || null,
      surveyMessagePost: tpl?.surveyMessagePost || null,
    });
  } catch (err) {
    console.error('GET /evaluations/public/form', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/evaluations/public/respond
 * body: { token, answers: { [questionId]: value }, comment?: string }
 */
router.post('/respond', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const out = await submitClientEvaluationByToken(token, {
      answers: req.body.answers,
      comment: req.body.comment,
    });
    res.json(out);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.error('POST /evaluations/public/respond', err);
    res.status(code).json({ error: err.message });
  }
});

module.exports = router;
