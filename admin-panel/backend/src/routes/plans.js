'use strict';
const router = require('express').Router();
const prisma = require('../db');

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
    const { name, priceMonthly, priceYearly, maxAssets, maxUsers, storageGb, features } = req.body;
    const plan = await prisma.plan.create({ data: { name, priceMonthly, priceYearly, maxAssets, maxUsers, storageGb, features: features || {} } });
    res.status(201).json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/plans/:id
// Faz merge de `features` com o JSON existente (ex.: atualizar só facialVisionProvider sem apagar outras chaves).
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };
    if (data.features != null && typeof data.features === 'object' && !Array.isArray(data.features)) {
      const existing = await prisma.plan.findUnique({ where: { id }, select: { features: true } });
      const prev =
        existing?.features && typeof existing.features === 'object' && !Array.isArray(existing.features)
          ? existing.features
          : {};
      data.features = { ...prev, ...data.features };
    }
    const plan = await prisma.plan.update({ where: { id }, data });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
