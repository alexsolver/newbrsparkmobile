'use strict';
const router = require('express').Router();
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');

// GET /api/flags
router.get('/', async (req, res) => {
  try {
    const { tenantId } = req.query;
    // Return global flags merged with tenant overrides
    const [globals, overrides] = await Promise.all([
      prisma.featureFlag.findMany({ where: { tenantId: null }, orderBy: { key: 'asc' } }),
      tenantId ? prisma.featureFlag.findMany({ where: { tenantId } }) : Promise.resolve([]),
    ]);
    const merged = globals.map(g => {
      const override = overrides.find(o => o.key === g.key);
      return override || g;
    });
    res.json(merged);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/flags/:key — toggle global flag
router.patch('/:key', async (req, res) => {
  try {
    const { enabled, tenantId } = req.body;
    const tid = tenantId ?? null;
    let flag = await prisma.featureFlag.findFirst({ where: { key: req.params.key, tenantId: tid } });
    if (flag) {
      flag = await prisma.featureFlag.update({ where: { id: flag.id }, data: { enabled } });
    } else {
      flag = await prisma.featureFlag.create({
        data: { key: req.params.key, label: req.params.key, description: '', enabled, tenantId: tid }
      });
    }
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: `FLAG_${enabled ? 'ON' : 'OFF'}`,
        resource: req.params.key,
        category: 'ADMIN',
      },
    });
    res.json(flag);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
