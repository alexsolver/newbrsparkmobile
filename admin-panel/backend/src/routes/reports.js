'use strict';

const router = require('express').Router();
const prisma = require('../db');
const { ensureHttpsUrlForPublicInternet } = require('../lib/publicHttpsUrl');
const { adminAuthThenPanel, adminOrReportsApiKey } = require('../middleware/auth');
const { enforcePanelPermissions } = require('../middleware/panelPermissions');
const { effectiveLastSubmittedRevision } = require('../lib/effectiveExecutionRevision');
const { mapExecutionToPanelTask } = require('../lib/executionTaskPanel');
const { mergePresetConfig } = require('../lib/reportPresetDefaults');
const { buildFilteredExportPayload } = require('../lib/reportExportJson');

const DEFAULT_CONFIG = mergePresetConfig(null);

/** Cliente Prisma gerado antes de `PdfReportPreset` existir no schema → delegate ausente até `npx prisma generate`. */
function ensurePdfReportPresetModel(req, res, next) {
  const d = prisma.pdfReportPreset;
  if (!d || typeof d.findMany !== 'function') {
    return res.status(503).json({
      error:
        'Cliente Prisma desatualizado (falta o modelo PdfReportPreset). Na pasta admin-panel/backend execute: npx prisma generate && npx prisma migrate deploy — depois reinicie o servidor Node.',
    });
  }
  next();
}

router.use(ensurePdfReportPresetModel);

// ── Presets CRUD (só admin) ───────────────────────────────────

router.get('/presets', adminAuthThenPanel, async (_req, res) => {
  try {
    const rows = await prisma.pdfReportPreset.findMany({
      orderBy: [{ updatedAt: 'desc' }],
    });
    res.set('Cache-Control', 'no-store');
    res.json(rows);
  } catch (err) {
    console.error('[reports/presets GET]', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/presets/:id', adminAuthThenPanel, async (req, res) => {
  try {
    const row = await prisma.pdfReportPreset.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Preset não encontrado.' });
    res.set('Cache-Control', 'no-store');
    res.json(row);
  } catch (err) {
    console.error('[reports/presets/:id GET]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/presets', adminAuthThenPanel, async (req, res) => {
  try {
    const { name, slug, tenantId, config, isDefault } = req.body || {};
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Nome é obrigatório.' });
    }
    const merged = mergePresetConfig(config);
    const row = await prisma.pdfReportPreset.create({
      data: {
        name: String(name).trim(),
        slug: slug != null && String(slug).trim() !== '' ? String(slug).trim() : null,
        tenantId: tenantId || null,
        config: merged,
        isDefault: !!isDefault,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('[reports/presets POST]', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/presets/:id', adminAuthThenPanel, async (req, res) => {
  try {
    const { name, slug, tenantId, config, isDefault } = req.body || {};
    const existing = await prisma.pdfReportPreset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Preset não encontrado.' });
    const data = {};
    if (name != null) data.name = String(name).trim();
    if (slug !== undefined) data.slug = slug != null && String(slug).trim() !== '' ? String(slug).trim() : null;
    if (tenantId !== undefined) data.tenantId = tenantId || null;
    if (config !== undefined) data.config = mergePresetConfig(config);
    if (isDefault !== undefined) data.isDefault = !!isDefault;
    const row = await prisma.pdfReportPreset.update({
      where: { id: req.params.id },
      data,
    });
    res.json(row);
  } catch (err) {
    console.error('[reports/presets PATCH]', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/presets/:id', adminAuthThenPanel, async (req, res) => {
  try {
    await prisma.pdfReportPreset.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Preset não encontrado.' });
    console.error('[reports/presets DELETE]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Export execução (admin ou REPORTS_API_KEY) ────────────────

router.get(
  '/executions/:executionId/export',
  adminOrReportsApiKey,
  enforcePanelPermissions,
  async (req, res) => {
  try {
    const { executionId } = req.params;
    const presetId = req.query.presetId;
    const format = (req.query.format || 'json').toLowerCase();

    let presetConfig = DEFAULT_CONFIG;
    let presetMeta = null;
    if (presetId && String(presetId).trim() !== '') {
      const presetRow = await prisma.pdfReportPreset.findUnique({ where: { id: String(presetId) } });
      if (!presetRow) return res.status(404).json({ error: 'Preset não encontrado.' });
      presetConfig = mergePresetConfig(presetRow.config);
      presetMeta = { id: presetRow.id, name: presetRow.name, slug: presetRow.slug };
    }

    const ex = await prisma.checklistExecution.findUnique({
      where: { id: executionId },
      include: {
        template: true,
        revisions: {
          select: { revision: true },
          orderBy: { revision: 'desc' },
          take: 1,
        },
      },
    });
    if (!ex) return res.status(404).json({ error: 'Execução não encontrada.' });

    const emails = ex.ownerEmail ? [ex.ownerEmail] : [];
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { email: true, avatarUrl: true },
    });
    const userMap = users.reduce((acc, u) => {
      acc[u.email] = u;
      return acc;
    }, {});

    const lsr = effectiveLastSubmittedRevision(
      ex.lastSubmittedRevision,
      ex.revisions?.[0]?.revision
    );

    const task = mapExecutionToPanelTask(ex, {
      ownerAvatar: ensureHttpsUrlForPublicInternet(userMap[ex.ownerEmail]?.avatarUrl) || null,
      includeSchemaRaw: true,
      lastSubmittedRevision: lsr,
    });

    if (format === 'pdf') {
      return res.status(501).json({
        error: 'PDF via API ainda não implementado. Use format=json ou imprima a partir do painel.',
      });
    }

    if (format !== 'json') {
      return res.status(400).json({ error: 'Parâmetro format inválido. Use json.' });
    }

    const body = buildFilteredExportPayload(task, presetConfig);
    body.preset = presetMeta;
    res.set('Cache-Control', 'no-store');
    res.json(body);
  } catch (err) {
    console.error('[reports/export GET]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
