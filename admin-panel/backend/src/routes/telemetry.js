'use strict';
const router = require('express').Router();
const prisma  = require('../db');

// ─── POST /api/telemetry/batch — recebe array de eventos do app ───────────────
// Aceita sem autenticação JWT obrigatória (app offline-first)
router.post('/batch', async (req, res) => {
  try {
    const { events, ownerEmail, tenantId } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events deve ser um array não vazio.' });
    }

    const MAX_BATCH = 500;
    const batch = events.slice(0, MAX_BATCH);

    // Busca a política efetiva para calcular expiresAt por tier
    let policy = null;
    try {
      policy = await prisma.collectionPolicy.findFirst({
        where: { tenantId: tenantId || null, isActive: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!policy) {
        policy = await prisma.collectionPolicy.findFirst({
          where: { tenantId: null, isActive: true },
          orderBy: { createdAt: 'desc' },
        });
      }
    } catch (_) {}

    const now = new Date();

    const calcExpires = (tier) => {
      if (!policy) return null;
      if (tier === 'RAW_SHORT') {
        const d = new Date(now);
        d.setDate(d.getDate() + (policy.retentionGpsRawDays || 15));
        return d;
      }
      if (tier === 'OPERATIONAL') {
        const d = new Date(now);
        d.setDate(d.getDate() + (policy.retentionAuditDays || 180));
        return d;
      }
      if (tier === 'LEGAL') {
        const d = new Date(now);
        d.setFullYear(d.getFullYear() + (policy.retentionEventsYears || 5));
        return d;
      }
      return null; // PERMANENT
    };

    // Mapa de eventType → retentionTier
    const TIER_MAP = {
      SESSION_OPEN:      'OPERATIONAL',
      SESSION_CLOSE:     'OPERATIONAL',
      HEARTBEAT:         'RAW_SHORT',
      OS_ACCEPT:         'LEGAL',
      OS_START:          'LEGAL',
      CHECKIN:           'LEGAL',
      CHECKOUT:          'LEGAL',
      TRANSIT_START:     'LEGAL',
      TRANSIT_END:       'LEGAL',
      GEOFENCE_ENTER:    'LEGAL',
      GEOFENCE_EXIT:     'LEGAL',
      PAUSE:             'OPERATIONAL',
      RESUME:            'OPERATIONAL',
      FRAUD_FLAG:        'LEGAL',
      INTEGRITY_CHECK:   'OPERATIONAL',
      POLICY_VIOLATION:  'LEGAL',
    };

    const records = batch.map(evt => {
      const tier = TIER_MAP[evt.eventType] || 'OPERATIONAL';
      return {
        tenantId:        tenantId    || evt.tenantId    || null,
        ownerEmail:      ownerEmail  || evt.ownerEmail  || 'unknown',
        deviceId:        evt.deviceId || null,
        executionId:     evt.executionId || null,
        eventType:       evt.eventType,
        lat:             evt.lat    ?? null,
        lng:             evt.lng    ?? null,
        accuracy:        evt.accuracy ?? null,
        altitude:        evt.altitude ?? null,
        speed:           evt.speed  ?? null,
        heading:         evt.heading ?? null,
        locationSource:  evt.locationSource || null,
        batteryLevel:    evt.batteryLevel  ?? null,
        batteryCharging: evt.batteryCharging ?? null,
        networkType:     evt.networkType || null,
        appVersion:      evt.appVersion  || null,
        osVersion:       evt.osVersion   || null,
        deviceModel:     evt.deviceModel || null,
        isMockLocation:  evt.isMockLocation  || false,
        isRooted:        evt.isRooted        || false,
        clockDriftMs:    evt.clockDriftMs    ?? null,
        deviceTimestamp: evt.deviceTimestamp ? new Date(evt.deviceTimestamp) : null,
        payload:         evt.payload || null,
        retentionTier:   tier,
        expiresAt:       calcExpires(tier),
      };
    });

    await prisma.telemetryEvent.createMany({ data: records, skipDuplicates: true });

    res.json({ received: records.length, skipped: events.length - records.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/telemetry — consulta admin ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { ownerEmail, executionId, eventType, tenantId, from, to, limit = 100 } = req.query;
    const where = {};
    if (ownerEmail)  where.ownerEmail  = ownerEmail;
    if (executionId) where.executionId = executionId;
    if (eventType)   where.eventType   = eventType;
    if (tenantId)    where.tenantId    = tenantId;
    if (from || to) {
      where.serverTimestamp = {};
      if (from) where.serverTimestamp.gte = new Date(from);
      if (to)   where.serverTimestamp.lte = new Date(to);
    }
    const events = await prisma.telemetryEvent.findMany({
      where,
      orderBy: { serverTimestamp: 'desc' },
      take: Math.min(parseInt(limit), 1000),
    });
    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
