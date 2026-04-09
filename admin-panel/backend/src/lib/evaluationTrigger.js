'use strict';

const prisma = require('../db');

const DEFAULT_TEMPLATE_NAME = 'Satisfação pós-OS (padrão)';

/**
 * @param {string} tenantId
 * @returns {Promise<import('@prisma/client').EvaluationTemplate>}
 */
async function getOrCreateDefaultClientTemplate(tenantId) {
  const existing = await prisma.evaluationTemplate.findFirst({
    where: { tenantId, type: 'CLIENT', name: DEFAULT_TEMPLATE_NAME, active: true },
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  });
  if (existing && existing.questions.length > 0) return existing;

  return prisma.$transaction(async (tx) => {
    let tpl = await tx.evaluationTemplate.findFirst({
      where: { tenantId, type: 'CLIENT', name: DEFAULT_TEMPLATE_NAME },
    });
    if (!tpl) {
      tpl = await tx.evaluationTemplate.create({
        data: {
          tenantId,
          name: DEFAULT_TEMPLATE_NAME,
          type: 'CLIENT',
          active: true,
          triggerRules: { events: ['OS_SYNCED'] },
        },
      });
    }
    const count = await tx.evaluationTemplateQuestion.count({ where: { templateId: tpl.id } });
    if (count === 0) {
      const rows = [
        { text: 'Qualidade do serviço', type: 'RATING', categoryKey: 'qualidade', sortOrder: 0 },
        { text: 'Cumprimento de prazos', type: 'RATING', categoryKey: 'prazo', sortOrder: 1 },
        { text: 'Atendimento', type: 'RATING', categoryKey: 'atendimento', sortOrder: 2 },
      ];
      for (const q of rows) {
        await tx.evaluationTemplateQuestion.create({
          data: {
            templateId: tpl.id,
            text: q.text,
            type: q.type,
            categoryKey: q.categoryKey,
            sortOrder: q.sortOrder,
            weight: 1,
            required: true,
          },
        });
      }
    }
    return tx.evaluationTemplate.findFirst({
      where: { id: tpl.id },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
  });
}

/**
 * Cria instância PENDING após OS SYNCED (idempotente por execução + revisão).
 * @param {string} executionId
 * @returns {Promise<import('@prisma/client').EvaluationInstance | null>}
 */
async function onChecklistExecutionSynced(executionId) {
  const ex = await prisma.checklistExecution.findUnique({
    where: { id: executionId },
    include: { template: true },
  });
  if (!ex || String(ex.status).toUpperCase() !== 'SYNCED') return null;

  let tenantId = ex.template?.tenantId || null;
  const techUser = await prisma.user.findFirst({
    where: {
      email: { equals: ex.ownerEmail, mode: 'insensitive' },
      ...(tenantId ? { tenantId } : {}),
    },
  });
  if (!techUser) return null;
  if (!tenantId) tenantId = techUser.tenantId;

  const revision = Number.isFinite(ex.lastSubmittedRevision) ? ex.lastSubmittedRevision : 0;
  const idempotencyKey = `os_sync:${executionId}:${revision}`;

  const dup = await prisma.evaluationInstance.findUnique({ where: { idempotencyKey } });
  if (dup) return dup;

  const template = await getOrCreateDefaultClientTemplate(tenantId);

  const instance = await prisma.evaluationInstance.create({
    data: {
      tenantId,
      templateId: template.id,
      targetType: 'EXECUTION',
      executionId: ex.id,
      technicianUserId: techUser.id,
      status: 'PENDING',
      triggeredBy: 'OS_SYNCED',
      idempotencyKey,
    },
  });

  return instance;
}

module.exports = {
  getOrCreateDefaultClientTemplate,
  onChecklistExecutionSynced,
  DEFAULT_TEMPLATE_NAME,
};
