'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/dashboard — Stats overview
router.get('/', async (_req, res) => {
  try {
    const [
      totalTenants, activeUsers, totalAssets, stockItems,
      criticalStock, alerts, recentTenants, recentActivity
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.asset.count(),
      prisma.stockItem.count(),
      prisma.$queryRaw`SELECT COUNT(*) as cnt FROM "StockItem" WHERE "currentStock" <= "minStock"`.then(r => Number(r[0]?.cnt ?? 0)),
      prisma.auditLog.count({ where: { category: 'SYSTEM', createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      prisma.tenant.findMany({ orderBy: { createdAt: 'desc' }, take: 5, include: { subscription: { include: { plan: true } }, _count: { select: { users: true, assets: true } } } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { tenant: { select: { name: true } }, admin: { select: { email: true } }, user: { select: { email: true } } } }),
    ]);

    res.json({
      stats: { totalTenants, activeUsers, totalAssets, stockItems, criticalStock, alerts },
      recentTenants,
      recentActivity,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar dashboard.' });
  }
});

module.exports = router;
