'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/dashboard — Stats overview
router.get('/', async (_req, res) => {
  try {
    const since24h = new Date(Date.now() - 86400000);

    const [
      totalTenants, activeUsers, totalAssets,
      systemAuditEvents24h, recentTenants, recentActivity,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.asset.count(),
      prisma.auditLog.count({ where: { category: 'SYSTEM', createdAt: { gte: since24h } } }),
      prisma.tenant.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { subscription: { include: { plan: true } }, _count: { select: { users: true, assets: true } } } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { tenant: { select: { name: true, id: true } }, admin: { select: { email: true } }, user: { select: { email: true } } } }),
    ]);

    res.json({
      generatedAt: new Date().toISOString(),
      stats: {
        totalTenants,
        activeUsers,
        totalAssets,
        /** Eventos de auditoria categoria SYSTEM nas últimas 24 h. */
        systemAuditEvents24h,
      },
      recentTenants,
      recentActivity,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
});

module.exports = router;
