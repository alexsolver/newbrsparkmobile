'use strict';

const { saoPauloYearMonthFromDate } = require('./ftOsNumber');
const { tenantIsSharedAppRegistrationPool } = require('./resolveSharedRegistrationTenant');
const { tenantIsAppMobileMaster } = require('./appDefaultTenant');

/** @typedef {'AI_FACIAL'|'AI_VISION_DETECTION'|'AI_VISION_ANALYSIS'|'FIELD_TASK'|'ROUTINE_TASK'} QuotaKind */

const FIELD_BY_KIND = {
  AI_FACIAL: 'aiFacialCount',
  AI_VISION_DETECTION: 'aiVisionDetectionCount',
  AI_VISION_ANALYSIS: 'aiVisionAnalysisCount',
  FIELD_TASK: 'fieldTasksCount',
  ROUTINE_TASK: 'routineTasksCount',
};

const LIMIT_BY_FIELD = {
  aiFacialCount: 'quotaAiFacialPerMonth',
  aiVisionDetectionCount: 'quotaAiVisionDetectionPerMonth',
  aiVisionAnalysisCount: 'quotaAiVisionAnalysisPerMonth',
  fieldTasksCount: 'quotaFieldTasksMonthly',
  routineTasksCount: 'quotaRoutineTasksMonthly',
};

const MSG = {
  AI_FACIAL: 'Limite mensal de requisições de reconhecimento facial do plano foi atingido.',
  AI_VISION_DETECTION: 'Limite mensal de análises «Visão IA — detecção» do plano foi atingido.',
  AI_VISION_ANALYSIS: 'Limite mensal de análises «Visão IA — análise» (Gemini) do plano foi atingido.',
  FIELD_TASK: 'Limite mensal de OS de campo (FT) do plano foi atingido.',
  ROUTINE_TASK: 'Limite mensal de tarefas de rotina (RT) do plano foi atingido.',
  TECHNICIANS: 'Limite de técnicos de campo do plano foi atingido. Peça ao administrador para aumentar o pacote.',
  TEMPLATES: 'Limite de formulários ativos do plano foi atingido. Arquive ou desative modelos antes de criar outro.',
};

/**
 * Tenants onde o limite `maxTechnicians` do plano não aplica (piscina «Aria App (master)» + tenant org legada aria).
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} prisma
 * @param {string} tenantId
 */
async function isTechnicianSeatQuotaExemptTenant(prisma, tenantId) {
  if (!tenantId) return false;
  if (await tenantIsSharedAppRegistrationPool(prisma, tenantId)) return true;
  return tenantIsAppMobileMaster(prisma, tenantId);
}

function periodKeyNow() {
  return saoPauloYearMonthFromDate(new Date()).periodKey;
}

/**
 * Plano ativo do tenant (assinatura ACTIVE ou TRIALING).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string|null|undefined} tenantId
 */
async function loadActivePlanForTenant(prisma, tenantId) {
  if (!tenantId) return null;
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!sub?.plan) return null;
  const st = String(sub.status || '').toUpperCase();
  if (st === 'CANCELLED') return null;
  return sub.plan;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 * @param {QuotaKind} kind
 * @param {number} [delta]
 * @returns {Promise<{ ok: true } | { ok: false; error: string; code: string }>}
 */
async function consumeQuota(prisma, tenantId, kind, delta = 1) {
  if (!tenantId || !kind || delta < 1) return { ok: true };
  const field = FIELD_BY_KIND[kind];
  if (!field) return { ok: true };
  const plan = await loadActivePlanForTenant(prisma, tenantId);
  if (!plan) return { ok: true };
  const limitKey = LIMIT_BY_FIELD[field];
  const limit = limitKey ? Number(plan[limitKey]) : -1;
  if (!Number.isFinite(limit) || limit < 0) return { ok: true };

  const periodKey = periodKeyNow();

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.tenantPlanUsagePeriod.findUnique({
        where: { tenantId_periodKey: { tenantId, periodKey } },
      });
      const cur = row ? Number(row[field]) || 0 : 0;
      if (cur + delta > limit) {
        const err = new Error('PLAN_QUOTA');
        err.code = 'PLAN_QUOTA_EXCEEDED';
        err.msg = MSG[kind] || 'Limite do plano atingido.';
        throw err;
      }
      const base = {
        tenantId,
        periodKey,
        aiFacialCount: 0,
        aiVisionDetectionCount: 0,
        aiVisionAnalysisCount: 0,
        fieldTasksCount: 0,
        routineTasksCount: 0,
      };
      base[field] = delta;
      await tx.tenantPlanUsagePeriod.upsert({
        where: { tenantId_periodKey: { tenantId, periodKey } },
        create: base,
        update: { [field]: { increment: delta } },
      });
    });
    return { ok: true };
  } catch (e) {
    if (e && e.code === 'PLAN_QUOTA_EXCEEDED') {
      return { ok: false, error: e.msg, code: 'PLAN_QUOTA_EXCEEDED' };
    }
    throw e;
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 */
async function countActiveTechnicianSeats(prisma, tenantId) {
  return prisma.user.count({
    where: {
      tenantId,
      isActive: true,
      role: { in: ['USER', 'PROVIDER'] },
    },
  });
}

/**
 * Antes de criar usuário técnico (USER/PROVIDER) ativo.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 * @param {string} roleUpper
 */
async function assertTechnicianSeatForNewUser(prisma, tenantId, roleUpper) {
  const r = String(roleUpper || '').toUpperCase();
  if (r !== 'USER' && r !== 'PROVIDER') return { ok: true };
  if (await isTechnicianSeatQuotaExemptTenant(prisma, tenantId)) return { ok: true };
  const plan = await loadActivePlanForTenant(prisma, tenantId);
  if (!plan) return { ok: true };
  const max = Number(plan.maxTechnicians);
  if (!Number.isFinite(max) || max < 0) return { ok: true };
  const n = await countActiveTechnicianSeats(prisma, tenantId);
  if (n >= max) {
    return { ok: false, error: MSG.TECHNICIANS, code: 'PLAN_MAX_TECHNICIANS' };
  }
  return { ok: true };
}

/**
 * Como {@link assertTechnicianSeatForNewUser}; o nome mantém o sentido histórico — a quota
 * já fica isenta na piscina de registo partilhado e na tenant org legada (ver `isTechnicianSeatQuotaExemptTenant`).
 *
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} prisma
 * @param {string} tenantId
 * @param {string} roleUpper
 */
async function assertTechnicianSeatForNewUserUnlessSharedAppPool(prisma, tenantId, roleUpper) {
  return assertTechnicianSeatForNewUser(prisma, tenantId, roleUpper);
}

/**
 * Antes de PATCH em usuário (mudança de papel ou ativo).
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ id: string; tenantId: string; role: string; isActive: boolean }} existing
 * @param {{ role?: string; isActive?: boolean }} patch
 */
async function assertTechnicianSeatForUserPatch(prisma, existing, patch) {
  const nextRole = patch.role != null ? String(patch.role).toUpperCase() : String(existing.role || '').toUpperCase();
  const nextActive = patch.isActive !== undefined ? !!patch.isActive : !!existing.isActive;
  const willBeTech = nextActive && (nextRole === 'USER' || nextRole === 'PROVIDER');
  if (!willBeTech) return { ok: true };
  if (await isTechnicianSeatQuotaExemptTenant(prisma, existing.tenantId)) return { ok: true };

  const plan = await loadActivePlanForTenant(prisma, existing.tenantId);
  if (!plan) return { ok: true };
  const max = Number(plan.maxTechnicians);
  if (!Number.isFinite(max) || max < 0) return { ok: true };

  const others = await prisma.user.count({
    where: {
      tenantId: existing.tenantId,
      isActive: true,
      role: { in: ['USER', 'PROVIDER'] },
      NOT: { id: existing.id },
    },
  });
  const total = others + 1;
  if (total > max) {
    return { ok: false, error: MSG.TECHNICIANS, code: 'PLAN_MAX_TECHNICIANS' };
  }
  return { ok: true };
}

/**
 * Antes de criar modelo de checklist com tenantId definido.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 */
async function assertChecklistTemplateCapacity(prisma, tenantId) {
  if (!tenantId) return { ok: true };
  const plan = await loadActivePlanForTenant(prisma, tenantId);
  if (!plan) return { ok: true };
  const max = Number(plan.maxChecklistTemplates);
  if (!Number.isFinite(max) || max < 0) return { ok: true };
  const cnt = await prisma.checklistTemplate.count({
    where: { tenantId, isActive: true },
  });
  if (cnt >= max) {
    return { ok: false, error: MSG.TEMPLATES, code: 'PLAN_MAX_TEMPLATES' };
  }
  return { ok: true };
}

module.exports = {
  periodKeyNow,
  loadActivePlanForTenant,
  consumeQuota,
  assertTechnicianSeatForNewUser,
  assertTechnicianSeatForNewUserUnlessSharedAppPool,
  assertTechnicianSeatForUserPatch,
  assertChecklistTemplateCapacity,
  countActiveTechnicianSeats,
  MSG,
};
