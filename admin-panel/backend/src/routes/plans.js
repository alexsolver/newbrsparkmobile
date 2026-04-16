'use strict';
const router = require('express').Router();
const prisma = require('../db');

const PLAN_INT_DEFAULTS = {
  maxTechnicians: 5,
  quotaAiFacialPerMonth: -1,
  quotaAiVisionDetectionPerMonth: -1,
  quotaAiVisionAnalysisPerMonth: -1,
  quotaFieldTasksMonthly: -1,
  quotaRoutineTasksMonthly: -1,
  quotaGoogleMapsRoutesPerMonth: -1,
  maxChecklistTemplates: -1,
};

function pickInt(body, key, fallback) {
  const v = body[key];
  if (v === undefined || v === null || v === '') return fallback;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function planWritableFields(body, { forCreate } = {}) {
  const maxAssets = pickInt(body, 'maxAssets', forCreate ? 100 : undefined);
  const maxUsers = pickInt(body, 'maxUsers', forCreate ? 5 : undefined);
  const storageGb = pickInt(body, 'storageGb', forCreate ? 10 : undefined);
  const out = {};
  if (body.name != null) out.name = String(body.name).trim();
  if (body.priceMonthly != null) out.priceMonthly = body.priceMonthly;
  if (body.priceYearly != null) out.priceYearly = body.priceYearly;
  if (maxAssets !== undefined) out.maxAssets = maxAssets;
  if (maxUsers !== undefined) out.maxUsers = maxUsers;
  if (storageGb !== undefined) out.storageGb = storageGb;
  if (body.maxTechnicians !== undefined && body.maxTechnicians !== null && body.maxTechnicians !== '') {
    out.maxTechnicians = pickInt(body, 'maxTechnicians', PLAN_INT_DEFAULTS.maxTechnicians);
  } else if (forCreate) out.maxTechnicians = PLAN_INT_DEFAULTS.maxTechnicians;
  if (body.quotaAiFacialPerMonth !== undefined && body.quotaAiFacialPerMonth !== null && body.quotaAiFacialPerMonth !== '') {
    out.quotaAiFacialPerMonth = pickInt(body, 'quotaAiFacialPerMonth', PLAN_INT_DEFAULTS.quotaAiFacialPerMonth);
  } else if (forCreate) out.quotaAiFacialPerMonth = PLAN_INT_DEFAULTS.quotaAiFacialPerMonth;
  if (
    body.quotaAiVisionDetectionPerMonth !== undefined &&
    body.quotaAiVisionDetectionPerMonth !== null &&
    body.quotaAiVisionDetectionPerMonth !== ''
  ) {
    out.quotaAiVisionDetectionPerMonth = pickInt(
      body,
      'quotaAiVisionDetectionPerMonth',
      PLAN_INT_DEFAULTS.quotaAiVisionDetectionPerMonth,
    );
  } else if (forCreate) out.quotaAiVisionDetectionPerMonth = PLAN_INT_DEFAULTS.quotaAiVisionDetectionPerMonth;
  if (
    body.quotaAiVisionAnalysisPerMonth !== undefined &&
    body.quotaAiVisionAnalysisPerMonth !== null &&
    body.quotaAiVisionAnalysisPerMonth !== ''
  ) {
    out.quotaAiVisionAnalysisPerMonth = pickInt(
      body,
      'quotaAiVisionAnalysisPerMonth',
      PLAN_INT_DEFAULTS.quotaAiVisionAnalysisPerMonth,
    );
  } else if (forCreate) out.quotaAiVisionAnalysisPerMonth = PLAN_INT_DEFAULTS.quotaAiVisionAnalysisPerMonth;
  if (body.quotaFieldTasksMonthly !== undefined && body.quotaFieldTasksMonthly !== null && body.quotaFieldTasksMonthly !== '') {
    out.quotaFieldTasksMonthly = pickInt(body, 'quotaFieldTasksMonthly', PLAN_INT_DEFAULTS.quotaFieldTasksMonthly);
  } else if (forCreate) out.quotaFieldTasksMonthly = PLAN_INT_DEFAULTS.quotaFieldTasksMonthly;
  if (
    body.quotaRoutineTasksMonthly !== undefined &&
    body.quotaRoutineTasksMonthly !== null &&
    body.quotaRoutineTasksMonthly !== ''
  ) {
    out.quotaRoutineTasksMonthly = pickInt(body, 'quotaRoutineTasksMonthly', PLAN_INT_DEFAULTS.quotaRoutineTasksMonthly);
  } else if (forCreate) out.quotaRoutineTasksMonthly = PLAN_INT_DEFAULTS.quotaRoutineTasksMonthly;
  if (
    body.quotaGoogleMapsRoutesPerMonth !== undefined &&
    body.quotaGoogleMapsRoutesPerMonth !== null &&
    body.quotaGoogleMapsRoutesPerMonth !== ''
  ) {
    out.quotaGoogleMapsRoutesPerMonth = pickInt(
      body,
      'quotaGoogleMapsRoutesPerMonth',
      PLAN_INT_DEFAULTS.quotaGoogleMapsRoutesPerMonth,
    );
  } else if (forCreate) out.quotaGoogleMapsRoutesPerMonth = PLAN_INT_DEFAULTS.quotaGoogleMapsRoutesPerMonth;
  if (body.maxChecklistTemplates !== undefined && body.maxChecklistTemplates !== null && body.maxChecklistTemplates !== '') {
    out.maxChecklistTemplates = pickInt(body, 'maxChecklistTemplates', PLAN_INT_DEFAULTS.maxChecklistTemplates);
  } else if (forCreate) out.maxChecklistTemplates = PLAN_INT_DEFAULTS.maxChecklistTemplates;
  if (body.isActive !== undefined) out.isActive = !!body.isActive;
  else if (forCreate) out.isActive = true;
  return out;
}

// GET /api/plans
router.get('/', async (_req, res) => {
  try {
    const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' }, include: { _count: { select: { subscriptions: true } } } });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plans
router.post('/', async (req, res) => {
  try {
    const { name, priceMonthly, priceYearly, features } = req.body;
    const extra = planWritableFields(req.body, { forCreate: true });
    const plan = await prisma.plan.create({
      data: {
        name,
        priceMonthly,
        priceYearly,
        maxAssets: extra.maxAssets,
        maxUsers: extra.maxUsers,
        storageGb: extra.storageGb,
        maxTechnicians: extra.maxTechnicians,
        quotaAiFacialPerMonth: extra.quotaAiFacialPerMonth,
        quotaAiVisionDetectionPerMonth: extra.quotaAiVisionDetectionPerMonth,
        quotaAiVisionAnalysisPerMonth: extra.quotaAiVisionAnalysisPerMonth,
        quotaFieldTasksMonthly: extra.quotaFieldTasksMonthly,
        quotaRoutineTasksMonthly: extra.quotaRoutineTasksMonthly,
        quotaGoogleMapsRoutesPerMonth: extra.quotaGoogleMapsRoutesPerMonth,
        maxChecklistTemplates: extra.maxChecklistTemplates,
        isActive: extra.isActive !== undefined ? extra.isActive : true,
        features: features || {},
      },
    });
    res.status(201).json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function mergePlanUpdate(id, body) {
  const data = planWritableFields(body, { forCreate: false });
  if (body.features != null && typeof body.features === 'object' && !Array.isArray(body.features)) {
    const existing = await prisma.plan.findUnique({ where: { id }, select: { features: true } });
    const prev =
      existing?.features && typeof existing.features === 'object' && !Array.isArray(existing.features)
        ? existing.features
        : {};
    data.features = { ...prev, ...body.features };
  }
  return prisma.plan.update({ where: { id }, data });
}

// PUT /api/plans/:id
// Faz merge de `features` com o JSON existente (ex.: atualizar só facialVisionProvider sem apagar outras chaves).
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await mergePlanUpdate(id, req.body);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/plans/:id — mesmo corpo que PUT (painel usa patch em algumas páginas)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await mergePlanUpdate(id, req.body);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
