/**
 * /api/tracking — Public real-time technician tracking
 * 
 * No adminAuth: these endpoints are either called by the mobile app 
 * (with bearer token) OR are fully public (GET /:token).
 */

const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const crypto  = require('crypto');

/** Sem GPS com coordenadas dentro deste intervalo → "sem sinal" no link público. Padrão 10 min (mau sinal / intervalos de GPS). Override: TRACKING_GPS_STALE_SEC. */
const DISPLACEMENT_GPS_STALE_SEC = Math.min(
  3600,
  Math.max(120, Number(process.env.TRACKING_GPS_STALE_SEC) || 600)
);

// Generates a URL-safe random token (16 bytes = 32 hex chars)
const makeToken = () => crypto.randomBytes(12).toString('hex'); // 24 chars

/** Evita spread de `metadata` null (typeof null === 'object') ou string JSON legada. */
function cloneExecMetadata(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && !Array.isArray(p)) return { ...p };
    } catch (_) {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  return {};
}

// ─── POST /api/tracking/start/:taskId ────────────────────────────────────────
// Called by mobile app when technician presses "Iniciar Deslocamento".
// Creates a unique public token linked to this execution.
router.post('/start/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });

    // Idempotent: reuse existing token if already started
    const existingToken = exec.metadata?.trackingToken;
    if (existingToken) {
      const url = `${req.protocol}://${req.get('host')}/track.html?t=${existingToken}`;
      return res.json({ token: existingToken, url });
    }

    const token = makeToken();
    const meta  = cloneExecMetadata(exec.metadata);

    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...meta,
          trackingToken:     token,
          trackingStartedAt: new Date().toISOString(),
          trackingExpiredAt: null,   // set when transit_end fires
        }
      }
    });

    const url = `${req.protocol}://${req.get('host')}/track.html?t=${token}`;
    console.log(`[TRACKING] ✅ Token criado para ${taskId}: ${token}`);
    res.json({ token, url });
  } catch (err) {
    console.error('[TRACKING] start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tracking/end/:taskId ──────────────────────────────────────────
// Called by mobile app when technician finishes transit.
// Sets expiry to now + 15 minutes.
router.post('/end/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });

    const meta = cloneExecMetadata(exec.metadata);
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // +15 min

    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...meta,
          trackingEndedAt:   new Date().toISOString(),
          trackingExpiredAt: expiry.toISOString(),
        },
      },
    });

    console.log(`[TRACKING] 🏁 Deslocamento encerrado ${taskId}, expira em ${expiry.toISOString()}`);
    res.json({ ok: true, expiresAt: expiry.toISOString() });
  } catch (err) {
    console.error('[TRACKING] end error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tracking/pause/:taskId ──────────────────────────────────────────
router.post('/pause/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    const meta = cloneExecMetadata(exec.metadata);
    meta.trackingPaused = true;
    meta.trackingPausedAt = new Date().toISOString();
    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { metadata: meta },
    });
    console.log(`[TRACKING] ⏸ Pausa gravada ${taskId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tracking/resume/:taskId ──────────────────────────────────────────
router.post('/resume/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    const meta = cloneExecMetadata(exec.metadata);
    meta.trackingPaused = false;
    delete meta.trackingPausedAt;
    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { metadata: meta },
    });
    console.log(`[TRACKING] ▶ Retomada gravada ${taskId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tracking/:token ─────────────────────────────────────────────────
// FULLY PUBLIC — no auth required.
// Returns real-time technician position, ETA, name, avatar, service info.
/** Lê pausa do metadata mesmo se vier string/number do JSON legado */
function isTrackingPaused(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const v = meta.trackingPaused;
  if (v === false || v === 0 || v === 'false' || v === '0') return false;
  if (v === true || v === 1) return true;
  if (v === 'true' || v === '1') return true;
  return false;
}

router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const selectExec = {
      id:              true,
      ownerEmail:      true,
      status:          true,
      etaMinutes:      true,
      locationLat:     true,
      locationLng:     true,
      locationAddress: true,
      locationZoneType:true,
      locationPolygon: true,
      metadata:        true,
    };

    // Índice direto no JSON — evita o bug das "últimas 200 OS" sem o token
    let exec = await prisma.checklistExecution.findFirst({
      where: {
        status: { not: 'CANCELLED' },
        metadata: { path: ['trackingToken'], equals: token },
      },
      select: selectExec,
    });

    if (!exec) {
      const execs = await prisma.checklistExecution.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: selectExec,
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      exec = execs.find(e => {
        const m = e.metadata;
        return m && typeof m === 'object' && m.trackingToken === token;
      }) || null;
    }

    if (!exec) {
      return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    }

    const meta = exec.metadata && typeof exec.metadata === 'object' ? exec.metadata : {};

    // Check expiry
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (meta.trackingExpiredAt && new Date() > new Date(meta.trackingExpiredAt)) {
      return res.status(410).json({
        expired: true,
        message: 'Este link de rastreamento expirou.',
        endedAt: meta.trackingEndedAt,
      });
    }

    // Fetch technician profile (name + avatar)
    let techName   = exec.ownerEmail?.split('@')[0] || 'Técnico';
    let techAvatar = null;
    let techPhone  = null;
    try {
      const userRecord = await prisma.user.findFirst({
        where: { email: exec.ownerEmail },
        select: { name: true, avatarUrl: true },
      });
      if (userRecord) {
        techName   = userRecord.name  || techName;
        techAvatar = userRecord.avatarUrl || null;
        techPhone  = userRecord.phone || null;
      }
    } catch(e) { /* user table may not have phone col yet */ }

    // GPS: 1) eventos desta execução; 2) se estiverem velhos/ausentes, heartbeats do técnico sem executionId
    // (o app às vezes envia HEARTBEAT só com ownerEmail; o ETA no painel usa lógica parecida).
    let currentLat = null;
    let currentLng = null;
    let gpsAge     = null;
    try {
      const gpsSelect = { lat: true, lng: true, serverTimestamp: true, deviceTimestamp: true };

      const pickLatestBySampleTime = async (where) => {
        const rows = await prisma.telemetryEvent.findMany({
          where,
          take: 100,
          orderBy: { serverTimestamp: 'desc' },
          select: gpsSelect,
        });
        if (!rows.length) return null;
        const sampleMs = (e) => new Date(e.deviceTimestamp || e.serverTimestamp).getTime();
        return rows.reduce((best, r) => (sampleMs(r) > sampleMs(best) ? r : best));
      };

      const evExec = await pickLatestBySampleTime({
        executionId: exec.id,
        lat: { not: null },
        lng: { not: null },
      });

      const evOwnerLoose = await pickLatestBySampleTime({
        ownerEmail: exec.ownerEmail,
        lat: { not: null },
        lng: { not: null },
        OR: [{ executionId: null }, { executionId: '' }],
      });

      const ageSec = (ev) =>
        ev
          ? Math.round((Date.now() - new Date(ev.deviceTimestamp || ev.serverTimestamp).getTime()) / 1000)
          : null;

      let ev = evExec;
      const execAge = evExec ? ageSec(evExec) : null;

      if (evOwnerLoose) {
        if (!evExec) {
          ev = evOwnerLoose;
        } else if (
          execAge != null &&
          execAge > DISPLACEMENT_GPS_STALE_SEC &&
          new Date(evOwnerLoose.deviceTimestamp || evOwnerLoose.serverTimestamp) >
            new Date(evExec.deviceTimestamp || evExec.serverTimestamp)
        ) {
          ev = evOwnerLoose;
        }
      }

      if (ev) {
        currentLat = typeof ev.lat === 'number' ? ev.lat : parseFloat(ev.lat);
        currentLng = typeof ev.lng === 'number' ? ev.lng : parseFloat(ev.lng);
        if (!Number.isFinite(currentLat)) currentLat = null;
        if (!Number.isFinite(currentLng)) currentLng = null;
        if (currentLat != null && currentLng != null) {
          gpsAge = ageSec(ev);
        }
      }
    } catch (e) {}

    const isPausedFlag = isTrackingPaused(meta);
    const isEnded = !!meta.trackingEndedAt;
    const trackingActive = !isEnded && !isPausedFlag;
    const freshGps =
      gpsAge != null && Number.isFinite(gpsAge) && gpsAge <= DISPLACEMENT_GPS_STALE_SEC;
    /** true = link ainda "aberto" mas não há GPS recente (técnico pode ter fechado o app). */
    const signalLost = trackingActive && !freshGps;

    // Polilinha do template (painel), até o cliente pedir rota nas ruas via /api/osrm/route-polyline
    let routePolyline = null;
    try {
      let poly = exec.locationPolygon;
      if (typeof poly === 'string') poly = JSON.parse(poly);
      if (Array.isArray(poly) && poly.length >= 2) {
        routePolyline = poly.map((pt) => {
          if (Array.isArray(pt) && pt.length >= 2) return [Number(pt[0]), Number(pt[1])];
          if (pt && pt.lat != null && pt.lng != null) return [Number(pt.lat), Number(pt.lng)];
          return null;
        }).filter((row) => row && row.every((n) => Number.isFinite(n)));
        if (routePolyline.length < 2) routePolyline = null;
      }
    } catch (_) {
      routePolyline = null;
    }

    let destLat = exec.locationLat != null ? Number(exec.locationLat) : null;
    let destLng = exec.locationLng != null ? Number(exec.locationLng) : null;
    if ((!Number.isFinite(destLat) || !Number.isFinite(destLng)) && exec.locationPolygon) {
      try {
        const poly =
          typeof exec.locationPolygon === 'string'
            ? JSON.parse(exec.locationPolygon)
            : exec.locationPolygon;
        if (Array.isArray(poly) && poly.length > 0) {
          // Rota/segmento: destino costuma ser o último vértice, não o primeiro
          const p = poly[poly.length - 1];
          const la = p?.[0] ?? p?.lat;
          const ln = p?.[1] ?? p?.lng;
          const nla = typeof la === 'number' ? la : parseFloat(String(la ?? '').replace(',', '.'));
          const nln = typeof ln === 'number' ? ln : parseFloat(String(ln ?? '').replace(',', '.'));
          if (Number.isFinite(nla) && Number.isFinite(nln)) {
            destLat = nla;
            destLng = nln;
          }
        }
      } catch (_) {}
    }

    return res.json({
      // Technician
      techName,
      techAvatar,
      techPhone,
      techEmail: exec.ownerEmail,

      // Current position
      currentLat,
      currentLng,
      gpsAgeSeconds: gpsAge,

      // Destination (fallback: primeiro vértice do polígono)
      destLat,
      destLng,
      destAddress: exec.locationAddress || meta.locationAddress || null,

      // Service info
      serviceTitle: meta.title || 'Atendimento Técnico',
      serviceDesc:  meta.description || null,
      zoneType:     exec.locationZoneType,

      // ETA
      etaMinutes: exec.etaMinutes,

      // Route (for map polyline)
      routePolyline,

      // Status
      isEnded,
      isPaused:  isPausedFlag,
      signalLost,
      gpsStaleAfterSeconds: DISPLACEMENT_GPS_STALE_SEC,
      endedAt:   meta.trackingEndedAt    || null,
      startedAt: meta.trackingStartedAt  || null,
      expiresAt: meta.trackingExpiredAt  || null,
    });
  } catch (err) {
    console.error('[TRACKING] GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
