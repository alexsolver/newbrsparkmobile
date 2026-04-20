'use strict';
const router = require('express').Router();
const prisma  = require('../db');
const authUser = require('../middleware/authUser');
const { latestGpsAgeSecondsByExecutionIds } = require('../lib/executionTelemetryGps');
const { normalizeOsrmBaseUrl, DEFAULT_OSRM_BASE } = require('../lib/osrmBaseUrl');
const { osrmEtaMinutesMatchOrRoute } = require('../lib/osrmEta');

/** Hora da amostra no dispositivo (GPS); se ausente, hora de recebimento no servidor. */
function telemetrySampleTimeMs(row) {
  const t = row && (row.deviceTimestamp || row.serverTimestamp);
  return t ? new Date(t).getTime() : 0;
}

function sortTelemetryRowsChronologically(rows) {
  return [...rows].sort((a, b) => telemetrySampleTimeMs(a) - telemetrySampleTimeMs(b));
}

function tracePointAt(row) {
  const t = row.deviceTimestamp || row.serverTimestamp;
  return t ? new Date(t) : null;
}

/** Sem GPS válido há N segundos → alerta para o técnico (notificação local no app). */
const STALE_GPS_NOTIFY_SEC = Math.min(
  3600,
  Math.max(60, Number(process.env.TRACKING_GPS_STALE_NOTIFY_SEC) || 300)
);

function parseMetadata(raw) {
  let m = raw || {};
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      m = {};
    }
  }
  return m && typeof m === 'object' ? m : {};
}

async function clearStaleGpsAlertsForExecutionIds(ids) {
  const uniq = [...new Set(ids)].filter(Boolean);
  for (const id of uniq) {
    try {
      const ex = await prisma.checklistExecution.findUnique({ where: { id }, select: { metadata: true } });
      if (!ex) continue;
      const meta = parseMetadata(ex.metadata);
      if (!meta.trackingGpsStaleAlertAt) continue;
      await prisma.checklistExecution.update({
        where: { id },
        data: { metadata: { ...meta, trackingGpsStaleAlertAt: null } },
      });
    } catch (e) {
      console.warn('[telemetry] clear stale alert:', id, e.message);
    }
  }
}

async function runStaleGpsAlertCron() {
  try {
    const tasks = await prisma.checklistExecution.findMany({
      where: { status: { in: ['ACCEPTED', 'IN_PROGRESS'] } },
      select: { id: true, metadata: true },
    });
    const active = tasks.filter((t) => {
      const m = parseMetadata(t.metadata);
      return !!(m.trackingStartedAt && !m.trackingEndedAt && !m.trackingPaused);
    });
    if (active.length === 0) return;
    const ages = await latestGpsAgeSecondsByExecutionIds(active.map((t) => t.id));
    for (const t of active) {
      const age = ages.get(t.id);
      const stale = age == null || !Number.isFinite(age) || age >= STALE_GPS_NOTIFY_SEC;
      const meta = parseMetadata(t.metadata);
      const next = { ...meta };
      if (stale) {
        if (!next.trackingGpsStaleAlertAt) {
          next.trackingGpsStaleAlertAt = new Date().toISOString();
          await prisma.checklistExecution.update({ where: { id: t.id }, data: { metadata: next } });
        }
      } else if (next.trackingGpsStaleAlertAt) {
        next.trackingGpsStaleAlertAt = null;
        await prisma.checklistExecution.update({ where: { id: t.id }, data: { metadata: next } });
      }
    }
  } catch (err) {
    console.error('[StaleGPS Cron]', err.message);
  }
}

setInterval(runStaleGpsAlertCron, 90 * 1000);
setTimeout(runStaleGpsAlertCron, 8000);

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
    const osrmBase = normalizeOsrmBaseUrl(mapsInt?.baseUrl || DEFAULT_OSRM_BASE);

    for (const task of activeTasks) {
      const meta = typeof task.metadata === 'object' && task.metadata ? task.metadata : {};
      // Skip if tracking is explicitly paused or has ended successfully
      if (meta.trackingPaused || meta.trackingEndedAt) continue;

      // Resolve destination coordinates
      let destLat = task.locationLat;
      let destLng = task.locationLng;
      const zt = String(task.locationZoneType || '').toLowerCase();

      if (zt === 'segment' && (meta.transitSegmentDestination === 'A' || meta.transitSegmentDestination === 'B')) {
        try {
          const poly =
            typeof task.locationPolygon === 'string'
              ? JSON.parse(task.locationPolygon)
              : task.locationPolygon;
          if (Array.isArray(poly) && poly.length >= 2) {
            const idx = meta.transitSegmentDestination === 'B' ? 1 : 0;
            const p = poly[idx];
            if (Array.isArray(p)) {
              destLat = parseFloat(p[0]);
              destLng = parseFloat(p[1]);
            } else if (p && typeof p === 'object') {
              destLat = parseFloat(p.lat);
              destLng = parseFloat(p.lng ?? p.lon);
            }
          }
        } catch (_) {}
      }

      if (!destLat && task.locationPolygon && zt !== 'segment') {
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

      // Trace recente (cron) → OSRM Match com timestamps/radiuses/tidy; fallback Route no helper
      let traceRows = await prisma.telemetryEvent.findMany({
        where: { executionId: task.id, lat: { not: null }, lng: { not: null } },
        take: 200,
        select: { lat: true, lng: true, serverTimestamp: true, deviceTimestamp: true },
      });
      traceRows = sortTelemetryRowsChronologically(traceRows);
      traceRows = traceRows.slice(-18);

      if (traceRows.length === 0) {
        const fallbackList = await prisma.telemetryEvent.findMany({
          where: { ownerEmail: task.ownerEmail, lat: { not: null }, lng: { not: null } },
          take: 50,
          orderBy: { serverTimestamp: 'desc' },
          select: { lat: true, lng: true, serverTimestamp: true, deviceTimestamp: true },
        });
        const fallbackEv = fallbackList.reduce(
          (best, r) => (!best || telemetrySampleTimeMs(r) > telemetrySampleTimeMs(best) ? r : best),
          null,
        );
        if (fallbackEv) traceRows = [fallbackEv];
      }

      if (traceRows.length === 0) continue;

      const lastRow = traceRows[traceRows.length - 1];
      const newestTs = lastRow ? lastRow.deviceTimestamp || lastRow.serverTimestamp : null;
      if (newestTs) {
        const ageMin = (Date.now() - new Date(newestTs).getTime()) / 60000;
        if (ageMin > 30) continue;
      }

      const trace = traceRows.map((row) => ({
        lat: row.lat,
        lng: row.lng,
        at: tracePointAt(row),
      }));

      try {
        const etaMinutes = await osrmEtaMinutesMatchOrRoute(osrmBase, trace, destLat, destLng);
        if (etaMinutes != null) {
          await prisma.checklistExecution.update({
            where: { id: task.id },
            data: { etaMinutes },
          });
          console.log(`[ETA Cron] Task ${task.id}: ${etaMinutes} min (match/route)`);
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
      GEOFENCE_FIELD_AUDIT: 'LEGAL',
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

    const execFreshGps = [
      ...new Set(
        records
          .filter((r) => r.executionId && r.lat != null && r.lng != null)
          .map((r) => r.executionId)
      ),
    ];
    if (execFreshGps.length) {
      void clearStaleGpsAlertsForExecutionIds(execFreshGps);
    }

    // ─── ETA Engine (Background) ────────────────────────────────────────────────────────
    (async () => {
      try {
        if (typeof fetch === 'undefined') return; // Requires Node 18+ native fetch
        
        const execEvents = records.filter(r => r.executionId && r.lat !== null && r.lng !== null);
        if (execEvents.length === 0) return;
        
        const execIds = [...new Set(execEvents.map((e) => e.executionId))];

        const mapsInt = await prisma.integration.findFirst({ where: { type: 'MAPS', name: 'OSRM', status: 'ACTIVE' } });
        const osrmBaseUrl = normalizeOsrmBaseUrl(mapsInt?.baseUrl || DEFAULT_OSRM_BASE);

        for (const execId of execIds) {
          const task = await prisma.checklistExecution.findUnique({
            where: { id: execId },
            select: { status: true, locationLat: true, locationLng: true, locationZoneType: true, locationPolygon: true, metadata: true }
          });

          // Calcula ETA se estiver ACCEPTED ou IN_PROGRESS e tiver um lugar para ir
          let destLat = task?.locationLat;
          let destLng = task?.locationLng;
          const meta = typeof task?.metadata === 'object' && task?.metadata ? task.metadata : {};
          const ztBatch = String(task?.locationZoneType || '').toLowerCase();
          if (ztBatch === 'segment' && (meta.transitSegmentDestination === 'A' || meta.transitSegmentDestination === 'B')) {
            try {
              const poly =
                typeof task.locationPolygon === 'string'
                  ? JSON.parse(task.locationPolygon)
                  : task.locationPolygon;
              if (Array.isArray(poly) && poly.length >= 2) {
                const idx = meta.transitSegmentDestination === 'B' ? 1 : 0;
                const p = poly[idx];
                if (Array.isArray(p)) {
                  destLat = parseFloat(p[0]);
                  destLng = parseFloat(p[1]);
                } else if (p && typeof p === 'object') {
                  destLat = parseFloat(p.lat);
                  destLng = parseFloat(p.lng ?? p.lon);
                }
              }
            } catch (e) {
              /* ignore */
            }
          } else if (!destLat && task?.locationPolygon && ztBatch !== 'segment') {
            try {
              const poly =
                typeof task.locationPolygon === 'string' ? JSON.parse(task.locationPolygon) : task.locationPolygon;
              if (poly && poly.length > 0) {
                destLat = poly[0][0] || poly[0].lat;
                destLng = poly[0][1] || poly[0].lng;
              }
            } catch (e) {
              /* ignore */
            }
          }

          if (task && (task.status === 'ACCEPTED' || task.status === 'IN_PROGRESS') && destLat && destLng && !meta.trackingPaused && !meta.trackingEndedAt) {
            let traceRows = await prisma.telemetryEvent.findMany({
              where: { executionId: execId, lat: { not: null }, lng: { not: null } },
              take: 200,
              select: { lat: true, lng: true, serverTimestamp: true, deviceTimestamp: true },
            });
            traceRows = sortTelemetryRowsChronologically(traceRows);
            traceRows = traceRows.slice(-18);
            const trace = traceRows.map((row) => ({
              lat: row.lat,
              lng: row.lng,
              at: tracePointAt(row),
            }));

            try {
              const etaMinutes = await osrmEtaMinutesMatchOrRoute(osrmBaseUrl, trace, destLat, destLng);
              if (etaMinutes != null) {
                await prisma.checklistExecution.update({
                  where: { id: execId },
                  data: { etaMinutes },
                });
                console.log(`[ETA Engine] Updated task ${execId} ETA: ${etaMinutes} min (match/route)`);
              }
            } catch (e) {
              // Ignore timeouts/network errors
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

// ─── GET /api/telemetry/stale-reminders — app (JWT): OS em tracking sem GPS há 5+ min ──
router.get('/stale-reminders', authUser, async (req, res) => {
  try {
    const email = req.user.email;
    const tasks = await prisma.checklistExecution.findMany({
      where: { ownerEmail: email, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PENDING'] } },
      select: { id: true, metadata: true },
    });
    const flagged = tasks.filter((t) => {
      const m = parseMetadata(t.metadata);
      return !!m.trackingGpsStaleAlertAt;
    });
    if (flagged.length === 0) return res.json({ reminders: [] });
    const ages = await latestGpsAgeSecondsByExecutionIds(flagged.map((t) => t.id));
    const reminders = flagged.map((t) => {
      const m = parseMetadata(t.metadata);
      return {
        executionId: t.id,
        alertAt: m.trackingGpsStaleAlertAt,
        title: m.title || null,
        gpsAgeSeconds: ages.get(t.id) ?? null,
      };
    });
    res.json({ reminders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.runEtaCron = runEtaCron;
module.exports.runStaleGpsAlertCron = runStaleGpsAlertCron;
