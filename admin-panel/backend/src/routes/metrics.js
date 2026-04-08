'use strict';
const router = require('express').Router();
const prisma  = require('../db');

// ─── POST /api/metrics/calculate/:executionId ─────────────────────────────────
// Chamado automaticamente ao PATCH /api/checklists/executions/:id/status → COMPLETED
router.post('/calculate/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;

    const execution = await prisma.checklistExecution.findUnique({
      where: { id: executionId },
    });
    if (!execution) return res.status(404).json({ error: 'Execução não encontrada.' });

    // Busca eventos de telemetria desta execução
    const eventsRaw = await prisma.telemetryEvent.findMany({
      where: { executionId },
    });
    const sampleMs = (e) => new Date(e.deviceTimestamp || e.serverTimestamp).getTime();
    const events = [...eventsRaw].sort((a, b) => sampleMs(a) - sampleMs(b));

    // ── Cálculo de tempos (instante da coleta no dispositivo quando existir) ──
    const getTs = (type) => {
      const e = events.find((ev) => ev.eventType === type);
      return e ? e.deviceTimestamp || e.serverTimestamp : undefined;
    };
    const diff  = (a, b) => a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null;

    const transitStart = getTs('TRANSIT_START');
    const checkin      = getTs('CHECKIN');
    const checkout     = getTs('CHECKOUT');
    const osStart      = getTs('OS_START');

    const transitDurationMin = diff(transitStart, checkin);
    const onSiteDurationMin  = diff(checkin, checkout);

    // Atraso de chegada: diferença entre scheduledAt (se existir) e checkin
    const scheduledAt = execution.metadata?.scheduledAt;
    const siteArrivalDelayMin = scheduledAt && checkin
      ? Math.round((new Date(checkin) - new Date(scheduledAt)) / 60000)
      : null;

    // ── Distância percorrida (se houver trilha) ──────────────────────────────
    const locEvents = events.filter(e => e.lat && e.lng);
    let distanceKm = 0;
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371, toRad = d => d * Math.PI / 180;
      const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };
    for (let i = 1; i < locEvents.length; i++) {
      distanceKm += haversine(locEvents[i-1].lat, locEvents[i-1].lng, locEvents[i].lat, locEvents[i].lng);
    }

    // ── Integridade / Fraude ─────────────────────────────────────────────────
    const geofenceBreaches   = events.filter(e => e.eventType === 'GEOFENCE_EXIT').length;
    const fraudFlags         = events.filter(e => e.eventType === 'FRAUD_FLAG').map(e => e.payload);
    const policyViolations   = events.filter(e => e.eventType === 'POLICY_VIOLATION');
    const mockGpsEvents      = events.filter(e => e.isMockLocation);
    const rootedEvents       = events.filter(e => e.isRooted);

    // ── Scores (0-100) ───────────────────────────────────────────────────────
    let scoreExecution  = 100;
    let scoreReliability = 100;
    let scoreRisk        = 0;

    // Execution: penaliza ausência de checkin/checkout
    if (!checkin)  scoreExecution -= 30;
    if (!checkout) scoreExecution -= 30;
    if (geofenceBreaches > 0) scoreExecution -= Math.min(geofenceBreaches * 10, 30);
    scoreExecution = Math.max(0, scoreExecution);

    // Reliability: penaliza mock GPS, root, violações
    if (mockGpsEvents.length > 0) scoreReliability -= 50;
    if (rootedEvents.length  > 0) scoreReliability -= 30;
    scoreReliability = Math.max(0, scoreReliability);

    // Risk: aumenta com fraude
    scoreRisk += fraudFlags.length * 20;
    scoreRisk += policyViolations.length * 10;
    scoreRisk += mockGpsEvents.length * 25;
    scoreRisk = Math.min(100, scoreRisk);

    // ── Upsert da métrica ────────────────────────────────────────────────────
    const metric = await prisma.executionMetric.upsert({
      where:  { executionId },
      create: {
        executionId,
        tenantId:     execution.metadata?.tenantId || null,
        ownerEmail:   execution.ownerEmail,
        transitDurationMin,
        siteArrivalDelayMin,
        onSiteDurationMin,
        distanceKm:   parseFloat(distanceKm.toFixed(2)),
        geofenceBreaches,
        scoreExecution,
        scoreReliability,
        scoreRisk,
        fraudFlags:   fraudFlags.length > 0 ? fraudFlags : null,
        source:       'REALTIME',
      },
      update: {
        transitDurationMin,
        siteArrivalDelayMin,
        onSiteDurationMin,
        distanceKm:   parseFloat(distanceKm.toFixed(2)),
        geofenceBreaches,
        scoreExecution,
        scoreReliability,
        scoreRisk,
        fraudFlags:   fraudFlags.length > 0 ? fraudFlags : null,
        calculatedAt: new Date(),
        source:       'REALTIME',
      },
    });

    res.json(metric);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/metrics — lista métricas (admin) ───────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { ownerEmail, tenantId, from, to, limit = 50 } = req.query;
    const where = {};
    if (ownerEmail) where.ownerEmail = ownerEmail;
    if (tenantId)   where.tenantId   = tenantId;
    if (from || to) {
      where.calculatedAt = {};
      if (from) where.calculatedAt.gte = new Date(from);
      if (to)   where.calculatedAt.lte = new Date(to);
    }
    const metrics = await prisma.executionMetric.findMany({
      where,
      orderBy: { calculatedAt: 'desc' },
      take: Math.min(parseInt(limit), 500),
    });
    res.json(metrics);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
