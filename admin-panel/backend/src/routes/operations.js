'use strict';
const router = require('express').Router();
const prisma  = require('../db');
const { latestGpsAgeSecondsByExecutionIds } = require('../lib/executionTelemetryGps');

const OPS_GPS_STALE_SEC = Math.min(
  3600,
  Math.max(120, Number(process.env.TRACKING_GPS_STALE_SEC) || 600)
);

// ─── GET /api/operations/tasks ─────────────────────────────────
// Returns ALL ChecklistExecutions (all statuses) for Kanban monitoring
// No ownerEmail filter — shows ALL operations to admin for troubleshooting
router.get('/tasks', async (req, res) => {
  try {
    const { email, status, id, limit = 200 } = req.query;

    const where = {};
    if (email)  where.ownerEmail = email;
    if (status) where.status     = status.toUpperCase();
    if (id)     where.id         = id;

    const executions = await prisma.checklistExecution.findMany({
      where,
      include: { template: true },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    const emails = [...new Set(executions.map(e => e.ownerEmail).filter(Boolean))];
    const users = await prisma.user.findMany({
       where: { email: { in: emails } },
       select: { email: true, avatarUrl: true }
    });
    const userMap = users.reduce((acc, u) => { acc[u.email] = u; return acc; }, {});

    const activeTrackingIds = executions
      .filter((ex) => {
        let m = ex.metadata || {};
        if (typeof m === 'string') {
          try {
            m = JSON.parse(m);
          } catch (e) {
            m = {};
          }
        }
        return !!(m && m.trackingStartedAt && !m.trackingEndedAt && !m.trackingPaused);
      })
      .map((ex) => ex.id);
    const gpsAgeByExec = await latestGpsAgeSecondsByExecutionIds(activeTrackingIds);

    const tasks = executions.map(ex => {
      let meta = ex.metadata || {};
      if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e){} }

      // Build a field-label map from schemaData so the panel can show
      // human-readable question labels instead of raw field IDs.
      const schemaData = ex.template?.schemaData || [];
      const schemaArray = Array.isArray(schemaData) ? schemaData : 
                          (typeof schemaData === 'string' ? JSON.parse(schemaData) : []);

      const trackingLive =
        !!(meta && meta.trackingStartedAt && !meta.trackingEndedAt && !meta.trackingPaused);
      const gAge = gpsAgeByExec.get(ex.id);
      const trackingSignalLost =
        trackingLive &&
        (gAge == null || !Number.isFinite(gAge) || gAge > OPS_GPS_STALE_SEC);

      return {
        id:          ex.id,
        refId:       meta.refId || ex.templateId || null,
        ownerEmail:  ex.ownerEmail,
        ownerAvatar: userMap[ex.ownerEmail]?.avatarUrl || null,
        status:      ex.status,
        title:       meta.title       || (ex.template?.title)       || 'OS sem título',
        description: meta.description || (ex.template?.description) || '',
        metadata:    meta,
        responses:   ex.responses,
        gpsLocation: ex.gpsLocation,
        // Geofencing location data
        locationLat:      ex.locationLat,
        locationLng:      ex.locationLng,
        locationRadius:   ex.locationRadius,
        locationAddress:  ex.locationAddress,
        locationZoneType: ex.locationZoneType,
        locationPolygon:  ex.locationPolygon,
        createdAt:   ex.createdAt,
        startedAt:   ex.startedAt,
        completedAt: ex.completedAt,
        syncedAt:    ex.syncedAt,
        etaMinutes:  ex.etaMinutes,
        trackingGpsAgeSeconds: gAge ?? null,
        trackingSignalLost,
        // Template fields with labels — used by panel report view
        template: ex.template ? {
          id:     ex.template.id,
          title:  ex.template.title,
          fields: schemaArray
                    .filter((f) => f.type !== 'section_break' && f.type !== 'hidden')
                    .map((f) => ({ id: f.id, label: f.label || f.id, type: f.type })),
        } : null,
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json(tasks);
  } catch(err) {
    console.error('[operations/tasks GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/operations/tasks/:id ─────────────────────────
// Cancels a PENDING OS (hard delete from DB)
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ex = await prisma.checklistExecution.findUnique({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'OS não encontrada.' });

    await prisma.checklistExecution.update({ 
       where: { id },
       data: { status: 'CANCELLED' }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action:   'OS_CANCELLED',
        resource: 'ChecklistExecution',
        category: 'DATA',
        metadata: { executionId: id, ownerEmail: ex.ownerEmail, previousStatus: ex.status },
      }
    }).catch(() => {}); // non-fatal

    res.json({ success: true });
  } catch(err) {
    console.error('[operations/tasks DELETE]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/operations/tasks/:id/reject ─────────────────────────
// Rejects an OS
router.post('/tasks/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const ex = await prisma.checklistExecution.findUnique({ where: { id } });
    if (!ex) return res.status(404).json({ error: 'OS não encontrada.' });

    let meta = typeof ex.metadata === 'object' && ex.metadata ? ex.metadata : {};
    meta = { ...meta, rejectionReason: reason, rejectedAt: new Date().toISOString() };

    await prisma.checklistExecution.update({ 
       where: { id },
       data: { status: 'REJECTED', metadata: meta }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        action:   'OS_REJECTED',
        resource: 'ChecklistExecution',
        category: 'DATA',
        metadata: { executionId: id, ownerEmail: ex.ownerEmail, reason },
      }
    }).catch(() => {});

    res.json({ success: true });
  } catch(err) {
    console.error('[operations/tasks/reject POST]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
