'use strict';

const express = require('express');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { computeDrivingRouteMetrics } = require('../lib/googleMapsRoutesApi');
const {
  assertGoogleMapsRouteAllowed,
  recordGoogleMapsRouteSuccess,
} = require('../lib/googleMapsQuota');
const { isGoogleMapsPlatformName } = require('../lib/integrationNameMatch');

const router = express.Router();
router.use(authUser);

/**
 * POST /api/maps/google/route-metrics
 * Corpo: { originLat, originLng, destLat, destLng }
 * Requer JWT de utilizador do app. Consome cota mensal do tenant antes de chamar o Google.
 */
router.post('/route-metrics', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Tenant não identificado.' });

    const originLat = Number(req.body?.originLat);
    const originLng = Number(req.body?.originLng);
    const destLat = Number(req.body?.destLat);
    const destLng = Number(req.body?.destLng);

    const rows = await prisma.integration.findMany({
      where: { status: 'ACTIVE' },
      select: { apiKey: true, name: true },
    });
    const integ = rows.find((r) => isGoogleMapsPlatformName(r.name)) || null;
    if (!integ?.apiKey || !String(integ.apiKey).trim()) {
      return res.status(503).json({
        error: 'Integração Google Maps Platform não está configurada ou está inativa.',
        code: 'GOOGLE_MAPS_NOT_CONFIGURED',
      });
    }

    let beforeQuota;
    try {
      beforeQuota = await assertGoogleMapsRouteAllowed(prisma, tenantId);
    } catch (e) {
      if (e && e.code === 'GOOGLE_MAPS_QUOTA_EXCEEDED') {
        return res.status(429).json({ error: e.msg, code: e.code });
      }
      if (e && e.code === 'GOOGLE_MAPS_DISABLED') {
        return res.status(403).json({ error: e.msg, code: e.code });
      }
      throw e;
    }

    const result = await computeDrivingRouteMetrics(
      integ.apiKey,
      originLat,
      originLng,
      destLat,
      destLng,
    );

    if (!result.ok) {
      return res.status(502).json({
        error: result.message,
        code: 'GOOGLE_MAPS_UPSTREAM_ERROR',
        quota: {
          periodKey: beforeQuota.periodKey,
          monthlyLimit: beforeQuota.limit,
          usedThisMonth: beforeQuota.used,
        },
      });
    }

    const quotaInfo = await recordGoogleMapsRouteSuccess(prisma, tenantId);

    return res.json({
      ok: true,
      durationSeconds: result.durationSeconds,
      distanceMeters: result.distanceMeters,
      source: 'google_routes',
      quota: {
        periodKey: quotaInfo.periodKey,
        monthlyLimit: quotaInfo.limit,
        usedThisMonth: quotaInfo.usedAfter,
      },
    });
  } catch (err) {
    console.error('[googleMaps] route-metrics', err);
    return res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

/**
 * GET /api/maps/google/quota-preview — uso e limite efetivo (sem consumir).
 */
router.get('/quota-preview', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Tenant não identificado.' });
    const { getGoogleMapsRouteUsageState } = require('../lib/googleMapsQuota');
    const st = await getGoogleMapsRouteUsageState(prisma, tenantId);
    return res.json({
      periodKey: st.periodKey,
      monthlyLimit: st.limit,
      usedThisMonth: st.used,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
