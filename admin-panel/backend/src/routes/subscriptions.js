'use strict';
const router = require('express').Router();
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');

// GET /api/subscriptions
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const where = status ? { status } : {};
    const [subs, total] = await Promise.all([
      prisma.subscription.findMany({
        where, skip: (page-1)*limit, take: +limit, orderBy: { currentEnd: 'asc' },
        include: { tenant: { select: { name: true, email: true, status: true } }, plan: { select: { name: true, priceMonthly: true } }, invoices: { take: 1, orderBy: { createdAt: 'desc' } } }
      }),
      prisma.subscription.count({ where }),
    ]);
    res.json({ data: subs, total, page: +page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/subscriptions — assign or change plan
router.post('/', async (req, res) => {
  try {
    const { tenantId, planId, billingCycle = 'MONTHLY' } = req.body;
    if (!tenantId || !planId) return res.status(400).json({ error: 'tenantId e planId são obrigatórios.' });
    const now = new Date();
    const end = new Date(now);
    billingCycle === 'YEARLY' ? end.setFullYear(end.getFullYear() + 1) : end.setMonth(end.getMonth() + 1);

    const sub = await prisma.subscription.upsert({
      where: { tenantId },
      create: { tenantId, planId, billingCycle, status: 'ACTIVE', currentStart: now, currentEnd: end },
      update: { planId, billingCycle, status: 'ACTIVE', currentStart: now, currentEnd: end },
    });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        tenantId,
        action: 'SUBSCRIPTION_CHANGE',
        resource: planId,
        category: 'ADMIN',
      },
    });
    res.json(sub);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/subscriptions/:id/cancel
router.patch('/:id/cancel', async (req, res) => {
  try {
    const sub = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() }
    });
    res.json(sub);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/subscriptions/:id — alterar plano, ciclo ou estado (billing.html)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { planId, billingCycle, status, cancelledAt } = req.body;
    const data = {};
    if (planId) data.planId = String(planId);
    if (billingCycle === 'MONTHLY' || billingCycle === 'YEARLY') data.billingCycle = billingCycle;
    if (status === 'ACTIVE' || status === 'PAST_DUE' || status === 'CANCELLED' || status === 'TRIALING') {
      data.status = status;
    }
    if (cancelledAt !== undefined) {
      data.cancelledAt = cancelledAt ? new Date(cancelledAt) : null;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar (planId, billingCycle, status).' });
    }
    const sub = await prisma.subscription.update({ where: { id }, data });
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
