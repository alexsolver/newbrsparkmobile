'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/plans
router.get('/', async (_req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: 'asc' }, include: { _count: { select: { subscriptions: true } } } });
  res.json(plans);
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
router.put('/:id', async (req, res) => {
  try {
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data: req.body });
    res.json(plan);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
