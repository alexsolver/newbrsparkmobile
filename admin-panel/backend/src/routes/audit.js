'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/audit
router.get('/', async (req, res) => {
  try {
    const { category, tenantId, page = 1, limit = 100 } = req.query;
    const where = {
      ...(category && { category }),
      ...(tenantId && { tenantId }),
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where, skip: (page-1)*limit, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          tenant: { select: { name: true } },
          admin:  { select: { email: true } },
          user:   { select: { email: true } },
        }
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ data: logs, total, page: +page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
