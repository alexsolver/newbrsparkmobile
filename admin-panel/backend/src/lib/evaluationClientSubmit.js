'use strict';

const prisma = require('../db');
const { computeEvaluationScore } = require('./evaluationScoreCompute');
const { moderateClientComment } = require('./evaluationModeration');
const { buildInsights } = require('./evaluationInsights');
const { pushToUserById } = require('./evaluationPush');

/**
 * Cliente responde avaliação (instância PENDING, token válido).
 * @param {string} publicToken
 * @param {{ answers: Record<string, unknown>, comment?: string }} payload
 */
async function submitClientEvaluationByToken(publicToken, payload) {
  const token = String(publicToken || '').trim();
  if (!token) {
    const e = new Error('Token obrigatório.');
    e.statusCode = 400;
    throw e;
  }

  const inst = await prisma.evaluationInstance.findFirst({
    where: {
      publicToken: token,
      status: 'PENDING',
      publicTokenExpiresAt: { gt: new Date() },
    },
    include: {
      template: { include: { questions: { orderBy: { sortOrder: 'asc' } } } },
    },
  });

  if (!inst) {
    const e = new Error('Link inválido ou avaliação já respondida.');
    e.statusCode = 404;
    throw e;
  }

  const answers = payload.answers && typeof payload.answers === 'object' && !Array.isArray(payload.answers)
    ? payload.answers
    : {};
  const questions = inst.template.questions || [];

  for (const q of questions) {
    if (!q.required) continue;
    if (!(q.id in answers) || answers[q.id] === '' || answers[q.id] == null) {
      const e = new Error(`Resposta obrigatória em falta: ${q.text || q.id}`);
      e.statusCode = 400;
      throw e;
    }
  }

  const mod = moderateClientComment(payload.comment);
  const scored = computeEvaluationScore(questions, answers);
  const insights = buildInsights({
    classification: scored.classification,
    totalScore: scored.totalScore,
    scoreByCategory: scored.scoreByCategory,
  });

  const result = await prisma.$transaction(async (tx) => {
    for (const q of questions) {
      if (!(q.id in answers)) continue;
      const val = answers[q.id];
      await tx.evaluationResponse.create({
        data: {
          instanceId: inst.id,
          questionId: q.id,
          value: typeof val === 'object' && val !== null ? val : { value: val },
        },
      });
    }

    await tx.evaluationScore.create({
      data: {
        instanceId: inst.id,
        totalScore: scored.totalScore,
        scoreByCategory: scored.scoreByCategory,
        classification: scored.classification,
      },
    });

    const updated = await tx.evaluationInstance.update({
      where: { id: inst.id },
      data: {
        status: 'RESPONDED',
        publicToken: null,
        publicTokenExpiresAt: null,
        displayText: mod.displayText,
        rawClientText: mod.rawClientText,
        moderationMeta: mod.moderationMeta,
        insights,
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: inst.tenantId,
        action: 'EVALUATION_CLIENT_SUBMIT',
        resource: inst.id,
        category: 'DATA',
        metadata: { instanceId: inst.id, classification: scored.classification },
      },
    });

    return updated;
  });

  if (scored.classification === 'CRITICAL') {
    await pushToUserById(inst.technicianUserId, {
      title: 'Avaliação crítica',
      body: 'Recebeu uma avaliação classificada como crítica. Abra Minha Produtividade.',
      data: {
        type: 'EVALUATION_CRITICAL',
        evaluationInstanceId: inst.id,
      },
    });
  } else {
    await pushToUserById(inst.technicianUserId, {
      title: 'Nova avaliação',
      body: 'O cliente respondeu a uma avaliação de serviço.',
      data: {
        type: 'EVALUATION_NEW',
        evaluationInstanceId: inst.id,
      },
    });
  }

  return {
    ok: true,
    instanceId: result.id,
    classification: scored.classification,
    totalScore: scored.totalScore,
  };
}

module.exports = { submitClientEvaluationByToken };
