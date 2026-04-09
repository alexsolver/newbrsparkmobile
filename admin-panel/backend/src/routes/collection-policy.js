'use strict';
const router = require('express').Router();
const prisma  = require('../db');
const { auditActor } = require('../lib/auditActor');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Retorna a política efetiva para um tenant:
 * Começa com a política global (tenantId null) e aplica override do tenant se existir.
 */
async function getEffectivePolicy(tenantId, sectorCode) {
  // 1. Política global padrão (tenantId null, sectorCode null)
  let global = await prisma.collectionPolicy.findFirst({
    where: { tenantId: null, sectorCode: null, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!global) {
    // Cria a política global padrão automaticamente se não existir
    global = await prisma.collectionPolicy.create({
      data: { tenantId: null, sectorCode: null, label: 'Padrão Global', isActive: true },
    });
  }

  if (!tenantId) return { ...global, _source: 'global' };

  // 2. Override por tenant + setor (mais específico)
  const tenantSector = sectorCode
    ? await prisma.collectionPolicy.findFirst({
        where: { tenantId, sectorCode, isActive: true },
        orderBy: { createdAt: 'desc' },
      })
    : null;

  // 3. Override por tenant sem setor específico
  const tenantOnly = await prisma.collectionPolicy.findFirst({
    where: { tenantId, sectorCode: null, isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  const override = tenantSector || tenantOnly;
  if (!override) return { ...global, _source: 'global' };

  // Merge: global como base, override sobrescreve apenas campos definidos
  return {
    ...global,
    ...override,
    id: override.id,
    _source: tenantSector ? 'tenant_sector' : 'tenant',
    _globalId: global.id,
  };
}

// ─── PUBLIC (mobile app) ──────────────────────────────────────────────────────

// GET /api/collection-policy/effective — política efetiva para o app
router.get('/effective', async (req, res) => {
  try {
    const { tenantId, sectorCode } = req.query;
    const policy = await getEffectivePolicy(tenantId || null, sectorCode || null);
    res.json(policy);
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
      requireCheckinPhoto, allowOfflineCheckin, minOnSiteMinutes,
      outOfPolicyAction,
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
      ...(requireCheckinPhoto    !== undefined && { requireCheckinPhoto }),
      ...(allowOfflineCheckin    !== undefined && { allowOfflineCheckin }),
      ...(minOnSiteMinutes       !== undefined && { minOnSiteMinutes: parseInt(minOnSiteMinutes) }),
      ...(outOfPolicyAction      !== undefined && { outOfPolicyAction }),
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
      'requireCheckinPhoto', 'allowOfflineCheckin', 'minOnSiteMinutes',
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
    res.json(policy);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

