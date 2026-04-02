'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/assets — read-only admin view
router.get('/', async (req, res) => {
  try {
    const { tenantId, type, q, page = 1, limit = 50 } = req.query;
    const where = {
      ...(tenantId && { tenantId }),
      ...(type && { type }),
      ...(q && { title: { contains: q, mode: 'insensitive' } }),
    };
    const [assets, total] = await Promise.all([
      prisma.asset.findMany({ where, skip: (page-1)*limit, take: +limit, orderBy: { createdAt: 'desc' }, include: { tenant: { select: { name: true } }, _count: { select: { stockItems: true, children: true } } } }),
      prisma.asset.count({ where }),
    ]);
    res.json({ data: assets, total, page: +page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
