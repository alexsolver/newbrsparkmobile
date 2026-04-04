'use strict';
const router = require('express').Router();
const prisma  = require('../db');

// ─── ETA Background Engine (Server-side Cron) ────────────────────────────────
// Runs every 2 minutes. Finds all ACCEPTED/IN_PROGRESS tasks that have recent
// telemetry GPS events, calls OSRM, and saves etaMinutes to DB.
async function runEtaCron() {
  try {
    // Find all active tasks with a destination
    const activeTasks = await prisma.checklistExecution.findMany({
      where: { status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
      select: { id: true, ownerEmail: true, locationLat: true, locationLng: true, locationZoneType: true, locationPolygon: true, metadata: true }
    });

    if (activeTasks.length === 0) return;

    const mapsInt = await prisma.integration.findFirst({
      where: { type: 'MAPS', name: 'OSRM', status: 'ACTIVE' }
    }).catch(() => null);
    const osrmBase = mapsInt?.baseUrl || 'http://router.project-osrm.org';

    for (const task of activeTasks) {
      const meta = typeof task.metadata === 'object' && task.metadata ? task.metadata : {};
      // Skip if tracking is explicitly paused or has ended successfully
      if (meta.trackingPaused || meta.trackingEndedAt) continue;

      // Resolve destination coordinates
      let destLat = task.locationLat;
      let destLng = task.locationLng;

      if (!destLat && task.locationPolygon) {
        try {
          const poly = typeof task.locationPolygon === 'string'
            ? JSON.parse(task.locationPolygon)
            : task.locationPolygon;
          if (poly && poly.length > 0) {
            destLat = poly[0][0] || poly[0].lat;
            destLng = poly[0][1] || poly[0].lng;
          }
        } catch (_) {}
      }

      if (!destLat || !destLng) continue;

      // Find latest GPS event for this task from telemetry
      const latestEv = await prisma.telemetryEvent.findFirst({
        where: { executionId: task.id, lat: { not: null }, lng: { not: null } },
        orderBy: { serverTimestamp: 'desc' },
        select: { lat: true, lng: true, serverTimestamp: true }
      });

      // If no telemetry event, try to find the latest heartbeat from ownerEmail regardless
      const fallbackEv = !latestEv ? await prisma.telemetryEvent.findFirst({
        where: { ownerEmail: task.ownerEmail, lat: { not: null }, lng: { not: null } },
        orderBy: { serverTimestamp: 'desc' },
        select: { lat: true, lng: true }
      }) : null;

      const gps = latestEv || fallbackEv;
      if (!gps) continue;

      // Skip if GPS is stale (>30 minutes old)
      if (latestEv?.serverTimestamp) {
        const ageMin = (Date.now() - new Date(latestEv.serverTimestamp).getTime()) / 60000;
        if (ageMin > 30) continue;
      }

      // Call OSRM
      try {
        const url = `${osrmBase}/route/v1/driving/${gps.lng},${gps.lat};${destLng},${destLat}?overview=false`;
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const data = await r.json();
          if (data.routes && data.routes[0]) {
            const etaMinutes = Math.round(data.routes[0].duration / 60);
            await prisma.checklistExecution.update({
              where: { id: task.id },
              data: { etaMinutes }
            });
            console.log(`[ETA Cron] Task ${task.id}: ${etaMinutes} min`);
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.error('[ETA Cron] Error:', err.message);
  }
}

// Start cron every 2 minutes
setInterval(runEtaCron, 2 * 60 * 1000);
// Also run once on startup a few seconds after boot
setTimeout(runEtaCron, 5000);
// ────────────────────────────────────────────────────────────────────────────

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

    // ─── ETA Engine (Background) ────────────────────────────────────────────────────────
    (async () => {
      try {
        if (typeof fetch === 'undefined') return; // Requires Node 18+ native fetch
        
        const execEvents = records.filter(r => r.executionId && r.lat !== null && r.lng !== null);
        if (execEvents.length === 0) return;
        
        const latestEvents = {};
        for (const ev of execEvents) {
          latestEvents[ev.executionId] = ev; 
        }

        const mapsInt = await prisma.integration.findFirst({ where: { type: 'MAPS', name: 'OSRM', status: 'ACTIVE' } });
        const osrmBaseUrl = mapsInt?.baseUrl || 'http://router.project-osrm.org';

        for (const execId of Object.keys(latestEvents)) {
          const ev = latestEvents[execId];
          const task = await prisma.checklistExecution.findUnique({
            where: { id: execId },
            select: { status: true, locationLat: true, locationLng: true, locationZoneType: true, locationPolygon: true, metadata: true }
          });

          // Calcula ETA se estiver ACCEPTED ou IN_PROGRESS e tiver um lugar para ir
          let destLat = task?.locationLat;
          let destLng = task?.locationLng;
          if (!destLat && task?.locationPolygon) {
             try {
                const poly = typeof task.locationPolygon === 'string' ? JSON.parse(task.locationPolygon) : task.locationPolygon;
                if (poly && poly.length > 0) {
                   destLat = poly[0][0] || poly[0].lat;
                   destLng = poly[0][1] || poly[0].lng;
                }
             } catch(e){}
          }

          const meta = typeof task?.metadata === 'object' && task?.metadata ? task.metadata : {};

          if (task && (task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS') && destLat && destLng && !meta.trackingPaused && !meta.trackingEndedAt) {
            const osrmUrl = `${osrmBaseUrl}/route/v1/driving/${ev.lng},${ev.lat};${destLng},${destLat}?overview=false`;
            
            try {
              const osrmRes = await fetch(osrmUrl, { method: 'GET', signal: AbortSignal.timeout(5000) });
              if (osrmRes.ok) {
                const data = await osrmRes.json();
                if (data.routes && data.routes.length > 0) {
                  const durationSecs = data.routes[0].duration;
                  const etaMinutes = Math.round(durationSecs / 60);

                  await prisma.checklistExecution.update({
                    where: { id: execId },
                    data: { etaMinutes }
                  });
                  console.log(`[ETA Engine] Updated task ${execId} ETA: ${etaMinutes} min`);
                }
              }
            } catch(e) {
              // Ignore timeouts/network errors from external free API
            }
          }
        }
      } catch (err) {
        console.error('[ETA Engine] Error:', err.message);
      }
    })();
    // ───────────────────────────────────────────────────────────────────────────────────

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

// ─── GET /api/telemetry/run-eta — força cálculo de ETA agora ─────────────────
router.get('/run-eta', async (req, res) => {
  try {
    await runEtaCron();
    const updated = await prisma.checklistExecution.findMany({
      where: { status: { in: ['ACCEPTED', 'IN_PROGRESS'] }, etaMinutes: { not: null } },
      select: { id: true, status: true, etaMinutes: true, ownerEmail: true }
    });
    res.json({ ok: true, updatedTasks: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runEtaCron = runEtaCron;
