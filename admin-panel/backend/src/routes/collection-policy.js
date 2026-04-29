'use strict';
const router = require('express').Router();
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');
const { getEffectivePolicy } = require('../lib/effectiveCollectionPolicy');
const { normalizeGpsCapturePolicy, mergeGpsCapturePolicy } = require('../lib/gpsCapturePolicy');

// ─── PUBLIC (mobile app) ──────────────────────────────────────────────────────

// GET /api/collection-policy/effective — política efetiva para o app
router.get('/effective', async (req, res) => {
  try {
    const { tenantId, sectorCode } = req.query;
    const policy = await getEffectivePolicy(tenantId || null, sectorCode || null);
    const publicPolicy = { ...policy };
    delete publicPolicy.requireCheckinPhoto;
    delete publicPolicy.allowOfflineCheckin;
    delete publicPolicy._source;
    delete publicPolicy._globalId;
    res.json(publicPolicy);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ADMIN routes ─────────────────────────────────────────────────────────────

// GET /api/collection-policy — lista todas as políticas
router.get('/', async (req, res) => {
  try {
    const policies = await prisma.collectionPolicy.findMany({
      orderBy: [{ tenantId: 'asc' }, { createdAt: 'desc' }],
      include: { tenant: { select: { id: true, name: true, email: true, sectorCode: true } } },
    });
    res.json(policies);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/collection-policy/:id — política específica
router.get('/:id', async (req, res) => {
  try {
    const policy = await prisma.collectionPolicy.findUnique({
      where: { id: req.params.id },
      include: { tenant: { select: { id: true, name: true, email: true } } },
    });
    if (!policy) return res.status(404).json({ error: 'Política não encontrada.' });
    res.json(policy);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/collection-policy — criar nova política (global ou override)
router.post('/', async (req, res) => {
  try {
    const {
      tenantId, sectorCode, label,
      locationEnabled, locationBackgroundEnabled,
      locationIntervalIdleMin, locationIntervalTransitMin, locationIntervalTransitSec, locationIntervalOnSiteMin,
      locationDistanceFilterMeters,
      retentionGpsRawDays, retentionEventsYears, retentionAuditDays, retentionMetricsDays,
      mockGpsAction, rootJailbreakAction, clockDriftMaxSeconds,
      requireExplicitConsent, consentGranular, legalBasis,
      minOnSiteMinutes,
      outOfPolicyAction,
      gpsCapturePolicy,
    } = req.body;

    const data = {
      tenantId: tenantId || null,
      sectorCode: sectorCode || null,
      label: label || 'Configuração Personalizada',
      ...(locationEnabled            !== undefined && { locationEnabled }),
      ...(locationBackgroundEnabled  !== undefined && { locationBackgroundEnabled }),
      ...(locationIntervalIdleMin    !== undefined && { locationIntervalIdleMin: parseInt(locationIntervalIdleMin, 10) }),
      ...(locationIntervalTransitMin !== undefined && { locationIntervalTransitMin: parseInt(locationIntervalTransitMin, 10) }),
      ...(locationIntervalTransitSec !== undefined
        ? locationIntervalTransitSec === null || locationIntervalTransitSec === ''
          ? { locationIntervalTransitSec: null }
          : Number.isFinite(parseInt(locationIntervalTransitSec, 10))
            ? { locationIntervalTransitSec: parseInt(locationIntervalTransitSec, 10) }
            : {}
        : {}),
      ...(locationIntervalOnSiteMin  !== undefined && { locationIntervalOnSiteMin: parseInt(locationIntervalOnSiteMin, 10) }),
      ...(locationDistanceFilterMeters !== undefined && { locationDistanceFilterMeters: parseInt(locationDistanceFilterMeters) }),
      ...(retentionGpsRawDays   !== undefined && { retentionGpsRawDays: parseInt(retentionGpsRawDays) }),
      ...(retentionEventsYears  !== undefined && { retentionEventsYears: parseInt(retentionEventsYears) }),
      ...(retentionAuditDays    !== undefined && { retentionAuditDays: parseInt(retentionAuditDays) }),
      ...(retentionMetricsDays  !== undefined && { retentionMetricsDays: parseInt(retentionMetricsDays) }),
      ...(mockGpsAction         !== undefined && { mockGpsAction }),
      ...(rootJailbreakAction   !== undefined && { rootJailbreakAction }),
      ...(clockDriftMaxSeconds  !== undefined && { clockDriftMaxSeconds: parseInt(clockDriftMaxSeconds) }),
      ...(requireExplicitConsent !== undefined && { requireExplicitConsent }),
      ...(consentGranular        !== undefined && { consentGranular }),
      ...(legalBasis             !== undefined && { legalBasis }),
      ...(minOnSiteMinutes       !== undefined && { minOnSiteMinutes: parseInt(minOnSiteMinutes) }),
      ...(outOfPolicyAction      !== undefined && { outOfPolicyAction }),
      ...(gpsCapturePolicy !== undefined && { gpsCapturePolicy: normalizeGpsCapturePolicy(gpsCapturePolicy) }),
    };

    const policy = await prisma.collectionPolicy.create({ data });
    await prisma.auditLog.create({
      data: {
        ...auditActor(req),
        action: 'COLLECTION_POLICY_CREATE',
        resource: `Policy ${policy.id} | tenant: ${tenantId || 'global'}`,
        category: 'ADMIN',
      },
    });
    res.status(201).json(policy);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Já existe uma política para este tenant/setor.' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/collection-policy/:id — atualizar política
router.patch('/:id', async (req, res) => {
  try {
    const allowed = [
      'label', 'locationEnabled', 'locationBackgroundEnabled',
      'locationIntervalIdleMin', 'locationIntervalTransitMin', 'locationIntervalTransitSec', 'locationIntervalOnSiteMin',
      'locationDistanceFilterMeters',
      'retentionGpsRawDays', 'retentionEventsYears', 'retentionAuditDays', 'retentionMetricsDays',
      'mockGpsAction', 'rootJailbreakAction', 'clockDriftMaxSeconds',
      'requireExplicitConsent', 'consentGranular', 'legalBasis',
      'minOnSiteMinutes',
      'outOfPolicyAction', 'isActive',
    ];
    const intFields = new Set([
      'locationIntervalIdleMin', 'locationIntervalTransitMin', 'locationIntervalOnSiteMin',
      'locationDistanceFilterMeters',
      'retentionGpsRawDays', 'retentionEventsYears', 'retentionAuditDays', 'retentionMetricsDays',
      'clockDriftMaxSeconds', 'minOnSiteMinutes',
    ]);
    const data = {};
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      if (key === 'locationIntervalTransitSec') {
        const v = req.body[key];
        if (v === null || v === '') data[key] = null;
        else {
          const n = parseInt(v, 10);
          if (Number.isFinite(n)) data[key] = n;
        }
        continue;
      }
      if (intFields.has(key)) {
        const n = parseInt(req.body[key], 10);
        if (Number.isFinite(n)) data[key] = n;
        continue;
      }
      data[key] = req.body[key];
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'gpsCapturePolicy')) {
      const existing = await prisma.collectionPolicy.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Política não encontrada.' });
      data.gpsCapturePolicy = mergeGpsCapturePolicy(existing.gpsCapturePolicy, req.body.gpsCapturePolicy);
    }
    const updated = await prisma.collectionPolicy.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/collection-policy/:id — remover override (não permite deletar global)
router.delete('/:id', async (req, res) => {
  try {
    const policy = await prisma.collectionPolicy.findUnique({ where: { id: req.params.id } });
    if (!policy) return res.status(404).json({ error: 'Não encontrada.' });
    if (!policy.tenantId) return res.status(400).json({ error: 'A política global não pode ser removida. Use PATCH para editar.' });
    await prisma.collectionPolicy.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.effectiveHandler = async (req, res) => {
  try {
    const { tenantId, sectorCode } = req.query;
    const policy = await getEffectivePolicy(tenantId || null, sectorCode || null);
    const publicPolicy = { ...policy };
    delete publicPolicy.requireCheckinPhoto;
    delete publicPolicy.allowOfflineCheckin;
    delete publicPolicy._source;
    delete publicPolicy._globalId;
    res.json(publicPolicy);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

