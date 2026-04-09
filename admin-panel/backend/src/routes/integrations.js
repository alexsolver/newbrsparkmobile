'use strict';
const router = require('express').Router();
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');
const { testIntegration } = require('../lib/integrationTester');
const { normalizeOsrmBaseUrl } = require('../lib/osrmBaseUrl');

// GET /api/integrations
router.get('/', async (_req, res) => {
  try {
    const integrations = await prisma.integration.findMany({ orderBy: { type: 'asc' } });
    // Mask API keys
    res.json(integrations.map(i => ({
      ...i,
      apiKey: i.apiKey ? `${i.apiKey.slice(0, 6)}••••••••••••${i.apiKey.slice(-4)}` : null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    // Busca com apiKey completa (sem máscara)
    const integration = await prisma.integration.findUnique({ where: { id: req.params.id } });
    if (!integration) return res.status(404).json({ error: 'Integração não encontrada.' });

    const result = await testIntegration(integration);

    // Atualiza status e lastTestedAt no banco
    const newStatus = result.ok ? 'ACTIVE' : 'ERROR';
    await prisma.integration.update({
      where: { id: req.params.id },
      data: { status: newStatus, lastTestedAt: new Date() },
    });

    res.json({ ...result, status: newStatus });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /api/integrations
router.post('/', async (req, res) => {
  try {
    const { name, type, description, icon, apiKey, baseUrl, webhookUrl, status = 'ACTIVE', metadata } = req.body;
    let resolvedBase = baseUrl;
    if (type === 'MAPS' && name === 'OSRM' && baseUrl) {
      resolvedBase = normalizeOsrmBaseUrl(baseUrl);
    }
    const integration = await prisma.integration.create({
      data: { name, type, description, icon, apiKey, baseUrl: resolvedBase, webhookUrl, status, metadata }
    });
    await prisma.auditLog.create({
      data: { ...auditActor(req), action: 'INTEGRATION_ADD', resource: name, category: 'ADMIN' },
    });
    res.status(201).json({ ...integration, apiKey: integration.apiKey ? '••••••••' : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// PATCH /api/integrations/:id
router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.integration.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Integração não encontrada.' });
    let data = { ...req.body };
    if (existing.type === 'MAPS' && existing.name === 'OSRM' && data.baseUrl) {
      data = { ...data, baseUrl: normalizeOsrmBaseUrl(data.baseUrl) };
    }
    const integration = await prisma.integration.update({ where: { id: req.params.id }, data });
    res.json({ ...integration, apiKey: integration.apiKey ? '••••••••' : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/integrations/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.integration.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
