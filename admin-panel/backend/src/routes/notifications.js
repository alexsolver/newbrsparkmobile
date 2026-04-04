'use strict';
const router = require('express').Router();
const prisma = require('../db');

// GET /api/notifications/templates
router.get('/templates', async (_req, res) => {
  try {
    const templates = await prisma.notificationTemplate.findMany({ orderBy: { key: 'asc' } });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/templates
router.post('/templates', async (req, res) => {
  try {
    const { key, label, channel, subject, body, variables } = req.body;
    const template = await prisma.notificationTemplate.create({ data: { key, label, channel, subject, body, variables } });
    res.status(201).json(template);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/templates/:id
router.put('/templates/:id', async (req, res) => {
  try {
    const template = await prisma.notificationTemplate.update({ where: { id: req.params.id }, data: req.body });
    res.json(template);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/notifications/logs
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const [logs, total] = await Promise.all([
      prisma.notificationLog.findMany({
        skip: (page-1)*limit, take: +limit, orderBy: { sentAt: 'desc' },
        include: { template: { select: { label: true, channel: true } } }
      }),
      prisma.notificationLog.count(),
    ]);
    res.json({ data: logs, total, page: +page });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
