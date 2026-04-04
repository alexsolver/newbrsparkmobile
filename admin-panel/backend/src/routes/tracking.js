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

// Generates a URL-safe random token (16 bytes = 32 hex chars)
const makeToken = () => crypto.randomBytes(12).toString('hex'); // 24 chars

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
    const meta  = typeof exec.metadata === 'object' && exec.metadata ? exec.metadata : {};

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

    const meta = typeof exec.metadata === 'object' && exec.metadata ? exec.metadata : {};
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // +15 min

    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...meta,
          trackingEndedAt:   new Date().toISOString(),
          trackingExpiredAt: expiry.toISOString(),
        }
      }
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
    const meta = typeof exec.metadata === 'object' && exec.metadata ? exec.metadata : {};
    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { metadata: { ...meta, trackingPaused: true } }
    });
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
    const meta = typeof exec.metadata === 'object' && exec.metadata ? exec.metadata : {};
    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { metadata: { ...meta, trackingPaused: false } }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tracking/:token ─────────────────────────────────────────────────
// FULLY PUBLIC — no auth required.
// Returns real-time technician position, ETA, name, avatar, service info.
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find execution by tracking token stored in metadata JSON
    const execs = await prisma.checklistExecution.findMany({
      where: {
        status: { not: 'CANCELLED' }
      },
      select: {
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
      },
      orderBy: { createdAt: 'desc' },
      take: 200, // safety cap
    });

    const exec = execs.find(e => {
      const m = e.metadata;
      return m && typeof m === 'object' && m.trackingToken === token;
    });

    if (!exec) {
      return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    }

    const meta = exec.metadata || {};

    // Check expiry
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

    // Latest GPS from telemetry
    let currentLat = null;
    let currentLng = null;
    let gpsAge     = null;
    try {
      const ev = await prisma.telemetryEvent.findFirst({
        where: { executionId: exec.id, lat: { not: null }, lng: { not: null } },
        orderBy: { serverTimestamp: 'desc' },
        select: { lat: true, lng: true, serverTimestamp: true },
      });
      if (ev) {
        currentLat = ev.lat;
        currentLng = ev.lng;
        gpsAge = Math.round((Date.now() - new Date(ev.serverTimestamp).getTime()) / 1000); // seconds
      }
    } catch(e) {}

    // Determine if transit is active or ended
    const isEnded = !!meta.trackingEndedAt;

    // Build route polyline if available
    let routePolyline = null;
    if (exec.locationPolygon && Array.isArray(exec.locationPolygon) && exec.locationPolygon.length >= 2) {
      routePolyline = exec.locationPolygon; // [[lat,lng], ...]
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

      // Destination
      destLat:     exec.locationLat,
      destLng:     exec.locationLng,
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
      isPaused:  !!meta.trackingPaused,
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
