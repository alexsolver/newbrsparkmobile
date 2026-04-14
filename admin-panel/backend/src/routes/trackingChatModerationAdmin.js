'use strict';

const express = require('express');
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');
const {
  STAGES,
  resolveEffectivePolicy,
  parseStage,
} = require('../lib/trackingChatModerationPolicy');

const router = express.Router();

function auditFromReq(req, action, resource, tenantId = null) {
  const { adminId, userId } = auditActor(req);
  return prisma.auditLog.create({
    data: { adminId, userId, action, resource, category: 'ADMIN', tenantId },
  });
}

/** @param {unknown} raw */
function sanitizeTrackChatModerationPatch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  if (typeof raw.stage === 'string' && STAGES.includes(raw.stage.trim().toLowerCase())) {
    out.stage = raw.stage.trim().toLowerCase();
  }
  if (raw.blockHighConfidenceMin != null && Number.isFinite(Number(raw.blockHighConfidenceMin))) {
    out.blockHighConfidenceMin = Math.min(0.99, Math.max(0.5, Number(raw.blockHighConfidenceMin)));
  }
  if (raw.iaTimeoutMs != null && Number.isFinite(Number(raw.iaTimeoutMs))) {
    out.iaTimeoutMs = Math.min(8000, Math.max(500, Number(raw.iaTimeoutMs)));
  }
  if (raw.storeFullText === true || raw.storeFullText === false) {
    out.storeFullText = raw.storeFullText;
  }
  return out;
}

/**
 * GET /api/admin/tracking-chat-moderation/policy-help
 * Referência para o painel (sem segredos).
 */
router.get('/policy-help', (_req, res) => {
  res.json({
    ok: true,
    stages: [...STAGES],
    envKeys: [
      { key: 'TRACKING_CHAT_MODERATION_STAGE', hint: 'observe | warn | block_partial | full (padrão observe)' },
      { key: 'TRACKING_CHAT_MOD_BLOCK_CONFIDENCE', hint: '0,5–0,99 (padrão 0,75)' },
      { key: 'TRACKING_CHAT_MOD_IA_TIMEOUT_MS', hint: '500–8000 (padrão 2500)' },
      { key: 'TRACKING_CHAT_MOD_STORE_FULLTEXT', hint: '1 = gravar pré-visualização mais longa na auditoria' },
      { key: 'TRACKING_CHAT_MOD_RETENTION_DAYS', hint: 'TTL documental (job de limpeza por implementar)' },
    ],
    tenantFeaturesPath: 'Tenant.features.trackChatModeration',
  });
});

/**
 * GET /api/admin/tracking-chat-moderation/tenant/:tenantId
 */
router.get('/tenant/:tenantId', async (req, res) => {
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: req.params.tenantId },
      select: { id: true, name: true, slug: true, features: true },
    });
    if (!t) return res.status(404).json({ error: 'Tenant não encontrado.' });
    const tf =
      t.features && typeof t.features === 'object' && !Array.isArray(t.features)
        ? /** @type {Record<string, unknown>} */ (t.features)
        : {};
    const effective = resolveEffectivePolicy(tf);
    const sub =
      tf.trackChatModeration && typeof tf.trackChatModeration === 'object' && !Array.isArray(tf.trackChatModeration)
        ? tf.trackChatModeration
        : {};
    res.json({
      ok: true,
      tenant: { id: t.id, name: t.name, slug: t.slug },
      tenantTrackChatOverride: sub,
      effectivePolicy: effective,
      envStageRaw: process.env.TRACKING_CHAT_MODERATION_STAGE || '',
      envStageParsed: parseStage(process.env.TRACKING_CHAT_MODERATION_STAGE),
    });
  } catch (e) {
    console.error('[trackingChatModerationAdmin] tenant GET:', e);
    res.status(500).json({ error: 'Não foi possível carregar o tenant.' });
  }
});

/**
 * PATCH /api/admin/tracking-chat-moderation/tenant/:tenantId
 * Body: { trackChatModeration: { stage?, blockHighConfidenceMin?, iaTimeoutMs?, storeFullText? } | null }
 * `null` remove o override de moderação neste tenant.
 */
router.patch('/tenant/:tenantId', async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const { trackChatModeration } = req.body || {};
    const cur = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, features: true },
    });
    if (!cur) return res.status(404).json({ error: 'Tenant não encontrado.' });
    const feats =
      cur.features && typeof cur.features === 'object' && !Array.isArray(cur.features)
        ? { .../** @type {Record<string, unknown>} */ (cur.features) }
        : {};

    if (trackChatModeration === null) {
      delete feats.trackChatModeration;
    } else if (trackChatModeration && typeof trackChatModeration === 'object' && !Array.isArray(trackChatModeration)) {
      const cleaned = sanitizeTrackChatModerationPatch(trackChatModeration);
      const prev =
        feats.trackChatModeration && typeof feats.trackChatModeration === 'object' && !Array.isArray(feats.trackChatModeration)
          ? feats.trackChatModeration
          : {};
      feats.trackChatModeration = { ...prev, ...cleaned };
    } else {
      return res.status(400).json({ error: 'Envie { trackChatModeration: objeto } ou { trackChatModeration: null }.' });
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { features: feats },
      select: { id: true, name: true, slug: true, features: true },
    });
    await auditFromReq(req, 'TRACKING_CHAT_MOD_TENANT_FEATURES', updated.slug || updated.name, tenantId).catch(() => {});
    const tf =
      updated.features && typeof updated.features === 'object' && !Array.isArray(updated.features)
        ? /** @type {Record<string, unknown>} */ (updated.features)
        : {};
    res.json({
      ok: true,
      tenant: { id: updated.id, name: updated.name, slug: updated.slug },
      tenantTrackChatOverride: tf.trackChatModeration || {},
      effectivePolicy: resolveEffectivePolicy(tf),
    });
  } catch (e) {
    console.error('[trackingChatModerationAdmin] tenant PATCH:', e);
    res.status(500).json({ error: 'Não foi possível gravar.' });
  }
});

/**
 * GET /api/admin/tracking-chat-moderation/needs-review
 * Query: limit (default 50, max 200), cursor (createdAt ISO exclusivo menor)
 */
router.get('/needs-review', async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null;

    const rows = await prisma.trackingChatModerationEvent.findMany({
      where: {
        needsHumanReview: true,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        executionId: true,
        tenantId: true,
        actorRole: true,
        textHash: true,
        textLength: true,
        textPreview: true,
        category: true,
        severity: true,
        confidence: true,
        finalAction: true,
        stageAtTime: true,
        createdAt: true,
      },
    });

    const nextCursor =
      rows.length > 0 ? rows[rows.length - 1].createdAt.toISOString() : null;

    res.json({ ok: true, items: rows, nextCursor });
  } catch (e) {
    console.error('[trackingChatModerationAdmin] needs-review:', e);
    res.status(500).json({ error: 'Não foi possível listar eventos.' });
  }
});

/**
 * GET /api/admin/tracking-chat-moderation/metrics
 * Query: days (default 7, max 90) — agregação simples por dia.
 */
router.get('/metrics', async (req, res) => {
  try {
    const rawDays = Number(req.query.days);
    const days = Math.min(90, Math.max(1, Number.isFinite(rawDays) ? rawDays : 7));
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const grouped = await prisma.trackingChatModerationEvent.groupBy({
      by: ['finalAction'],
      where: { createdAt: { gte: from } },
      _count: { _all: true },
    });

    const needsHuman = await prisma.trackingChatModerationEvent.count({
      where: { createdAt: { gte: from }, needsHumanReview: true },
    });

    const byAction = {};
    for (const g of grouped) {
      byAction[g.finalAction] = g._count._all;
    }

    res.json({
      ok: true,
      from: from.toISOString(),
      days,
      byFinalAction: byAction,
      needsHumanReviewCount: needsHuman,
    });
  } catch (e) {
    console.error('[trackingChatModerationAdmin] metrics:', e);
    res.status(500).json({ error: 'Não foi possível calcular métricas.' });
  }
});

module.exports = router;
