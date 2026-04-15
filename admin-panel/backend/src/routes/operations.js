'use strict';
const router = require('express').Router();
const prisma  = require('../db');
const { auditActor } = require('../lib/auditActor');
const { adminAuthThenPanel, rejectOsAuth } = require('../middleware/auth');
const { sendExpoPushToMany } = require('../services/expoPush');
const { latestGpsAgeSecondsByExecutionIds } = require('../lib/executionTelemetryGps');
const { effectiveLastSubmittedRevision } = require('../lib/effectiveExecutionRevision');
const {
  stripRevisionSessionEvidenceInPlace,
} = require('../lib/revisionSessionFields');
const { mapExecutionToPanelTask } = require('../lib/executionTaskPanel');
const { resolveFieldTaskAssigneeEmail } = require('../lib/technicianEligibility');

const OPS_GPS_STALE_SEC = Math.min(
  3600,
  Math.max(120, Number(process.env.TRACKING_GPS_STALE_SEC) || 600)
);

/**
 * Painel: TENANT_ADMIN / MANAGER (e outros não-SaaS) só veem execuções cujo formulário pertence ao tenant do JWT.
 * SAAS_ADMIN: sem filtro. Admin legado (`!panelUser`): sem filtro.
 */
function panelOperationsTenantPrismaFilter(req) {
  const a = req.admin;
  if (!a || !a.panelUser) return null;
  const role = String(a.role || '').trim().toUpperCase();
  if (role === 'SAAS_ADMIN') return null;
  const tid = a.tenantId != null && String(a.tenantId).trim() !== '' ? String(a.tenantId).trim() : null;
  if (!tid) return null;
  return { template: { tenantId: tid } };
}

function mergeExecutionWhere(baseWhere, req) {
  const t = panelOperationsTenantPrismaFilter(req);
  if (!t) return baseWhere;
  const empty = !baseWhere || Object.keys(baseWhere).length === 0;
  if (empty) return t;
  return { AND: [baseWhere, t] };
}

/** `tenantId` do painel quando a listagem deve restringir utilizadores (avatares) ao mesmo tenant. */
function panelTenantIdForUserScope(req) {
  const a = req.admin;
  if (!a || !a.panelUser) return null;
  if (String(a.role || '').trim().toUpperCase() === 'SAAS_ADMIN') return null;
  const tid = a.tenantId != null && String(a.tenantId).trim() !== '' ? String(a.tenantId).trim() : null;
  return tid;
}

// ─── POST /api/operations/tasks/:id/reject (app móvel Live Activity / painel) ──
// Registado **antes** de `router.use(adminAuthThenPanel)` para aceitar JWT de utilizador do app.
router.post('/tasks/:id/reject', rejectOsAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    let ex;
    if (req.appUser) {
      ex = await prisma.checklistExecution.findFirst({
        where: {
          id,
          ownerEmail: { equals: String(req.appUser.email || '').trim(), mode: 'insensitive' },
          template: { tenantId: String(req.appUser.tenantId || '').trim() },
        },
      });
    } else {
      ex = await prisma.checklistExecution.findFirst({
        where: mergeExecutionWhere({ id }, req),
      });
    }
    if (!ex) return res.status(404).json({ error: 'OS não encontrada.' });

    let meta = typeof ex.metadata === 'object' && ex.metadata ? ex.metadata : {};
    meta = { ...meta, rejectionReason: reason, rejectedAt: new Date().toISOString() };

    await prisma.checklistExecution.update({
      where: { id },
      data: { status: 'REJECTED', metadata: meta },
    });

    await prisma.auditLog
      .create({
        data: {
          ...(req.appUser
            ? {
                adminId: null,
                userId: req.appUser.id,
                tenantId: req.appUser.tenantId,
              }
            : auditActor(req)),
          action: 'OS_REJECTED',
          resource: 'ChecklistExecution',
          category: 'DATA',
          metadata: { executionId: id, ownerEmail: ex.ownerEmail, reason },
        },
      })
      .catch(() => {});

    res.json({ success: true });
  } catch (err) {
    console.error('[operations/tasks/reject POST]', err);
    res.status(500).json({ error: err.message });
  }
});

router.use(adminAuthThenPanel);

/** Respostas de negócio preservadas; tempos de formulário/pausas/etapas limpos para nova sessão. */
function stripProductivityFromResponses(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = { ...raw };
  for (const k of Object.keys(out)) {
    if (
      k === '__form_started_at' ||
      k === '__form_completed_at' ||
      k === '__form_paused_since' ||
      k === '__form_fill_duration_sec' ||
      k === '__form_active_seconds' ||
      k === '__form_active_seconds_final' ||
      k === '__pause_history' ||
      k.startsWith('__section_start_') ||
      k.startsWith('__section_end_')
    ) {
      delete out[k];
    }
  }
  return out;
}

function stripResponsesForRevision(raw, templateSchemaData) {
  const out = stripProductivityFromResponses(raw);
  stripRevisionSessionEvidenceInPlace(out, templateSchemaData);
  return out;
}

// ─── GET /api/operations/tasks ─────────────────────────────────
// Kanban: execuções por estado. Admin legado / SAAS_ADMIN: todas as organizações.
// TENANT_ADMIN / MANAGER: só execuções cujo `ChecklistTemplate.tenantId` coincide com o JWT.
router.get('/tasks', async (req, res) => {
  try {
    const { email, status, id, limit = 200 } = req.query;
    let take = parseInt(String(limit), 10);
    if (!Number.isFinite(take) || take < 1) take = 200;
    if (take > 500) take = 500;
    const idNorm = id != null && String(id).trim() !== '' ? String(id).trim() : '';
    const includeSchemaRaw = Boolean(idNorm);

    const scopeRaw = req.query.scope != null ? String(req.query.scope).trim().toLowerCase() : '';
    /** `os` só FT/OS · `rt` só tarefas de rotina · `all` ambas (quadro unificado). */
    const scope = ['os', 'rt', 'all'].includes(scopeRaw) ? scopeRaw : 'os';

    /** ID de execução (cuid), número FT ou número RT (ex.: RT-2026-04-000001). */
    const clauses = [];
    if (email) clauses.push({ ownerEmail: email });
    if (status) clauses.push({ status: status.toUpperCase() });
    if (idNorm) {
      clauses.push({
        OR: [{ id: idNorm }, { osNumber: idNorm }, { routineTaskNumber: idNorm }],
      });
    }
    const innerWhere =
      clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { AND: clauses };

    const routineClause =
      scope === 'rt'
        ? { routineTaskNumber: { not: null } }
        : scope === 'os'
          ? { routineTaskNumber: null }
          : null;

    /** Com `id` explícito: ignora `scope` (carrega a execução pedida). Sem `id`: aplica filtro OS/RT/todas. */
    let where;
    if (idNorm) {
      where = innerWhere;
    } else if (!routineClause) {
      where = Object.keys(innerWhere).length === 0 ? {} : innerWhere;
    } else if (Object.keys(innerWhere).length === 0) {
      where = routineClause;
    } else {
      where = { AND: [innerWhere, routineClause] };
    }

    where = mergeExecutionWhere(where, req);

    const executions = await prisma.checklistExecution.findMany({
      where,
      include: {
        template: true,
        revisions: {
          select: { revision: true },
          orderBy: { revision: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    const emails = [...new Set(executions.map(e => e.ownerEmail).filter(Boolean))];
    const scopeTenantId = panelTenantIdForUserScope(req);
    const users = await prisma.user.findMany({
      where: {
        email: { in: emails },
        ...(scopeTenantId ? { tenantId: scopeTenantId } : {}),
      },
      select: { email: true, avatarUrl: true },
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

    const tasks = executions.map((ex) => {
      let meta = ex.metadata || {};
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch (e) {
          meta = {};
        }
      }

      const trackingLive =
        !!(meta && meta.trackingStartedAt && !meta.trackingEndedAt && !meta.trackingPaused);
      const gAge = gpsAgeByExec.get(ex.id);
      const trackingSignalLost =
        trackingLive &&
        (gAge == null || !Number.isFinite(gAge) || gAge > OPS_GPS_STALE_SEC);

      return mapExecutionToPanelTask(ex, {
        ownerAvatar: userMap[ex.ownerEmail]?.avatarUrl || null,
        includeSchemaRaw,
        lastSubmittedRevision: effectiveLastSubmittedRevision(
          ex.lastSubmittedRevision,
          ex.revisions?.[0]?.revision
        ),
        trackingGpsAgeSeconds: gAge ?? null,
        trackingSignalLost,
      });
    });

    res.set('Cache-Control', 'no-store');
    res.json(tasks);
  } catch(err) {
    console.error('[operations/tasks GET]', err);
    res.status(500).json({ error: err.message });
  }
});

function csvEscapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ─── GET /api/operations/tasks/:id/revisions/export ────────────
// CSV (UTF-8 BOM). ?includeResponses=1 adiciona colunas JSON (metadata_snapshot, responses)
router.get('/tasks/:id/revisions/export', async (req, res) => {
  try {
    const { id } = req.params;
    const includeResponses =
      req.query.includeResponses === '1' ||
      req.query.includeResponses === 'true' ||
      req.query.full === '1';

    const ex = await prisma.checklistExecution.findFirst({
      where: mergeExecutionWhere({ id }, req),
      select: { id: true, osNumber: true },
    });
    if (!ex) return res.status(404).json({ error: 'OS não encontrada.' });

    const select = {
      revision: true,
      completedAt: true,
      submissionId: true,
      createdAt: true,
      ...(includeResponses ? { metadataSnapshot: true, responses: true } : {}),
    };

    const revs = await prisma.checklistExecutionRevision.findMany({
      where: { executionId: id },
      orderBy: { revision: 'asc' },
      select,
    });

    const header = includeResponses
      ? [
          'execution_id',
          'os_number',
          'revision',
          'completed_at',
          'submission_id',
          'created_at',
          'metadata_snapshot_json',
          'responses_json',
        ]
      : ['execution_id', 'os_number', 'revision', 'completed_at', 'submission_id', 'created_at'];

    const lines = [header.join(',')];
    for (const r of revs) {
      const row = [
        csvEscapeCell(ex.id),
        csvEscapeCell(ex.osNumber || ''),
        csvEscapeCell(r.revision),
        csvEscapeCell(r.completedAt ? r.completedAt.toISOString() : ''),
        csvEscapeCell(r.submissionId || ''),
        csvEscapeCell(r.createdAt ? r.createdAt.toISOString() : ''),
      ];
      if (includeResponses) {
        row.push(csvEscapeCell(JSON.stringify(r.metadataSnapshot ?? null)));
        row.push(csvEscapeCell(JSON.stringify(r.responses ?? {})));
      }
      lines.push(row.join(','));
    }

    const safeSlice = (ex.id || 'os').slice(0, 8);
    const fname = `revisoes_${safeSlice}_${includeResponses ? 'full_' : ''}${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.set('Cache-Control', 'no-store');
    res.send(`\uFEFF${lines.join('\n')}`);
  } catch (err) {
    console.error('[operations/tasks/:id/revisions/export GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/operations/tasks/:id/revisions/:revision ────────
// Snapshot completo de uma revisão (respostas + metadata do envio)
router.get('/tasks/:id/revisions/:revision', async (req, res) => {
  try {
    const { id, revision } = req.params;
    const revNum = parseInt(revision, 10);
    if (!Number.isFinite(revNum) || revNum < 1 || String(revNum) !== String(revision).trim()) {
      return res.status(404).json({ error: 'Revisão inválida.' });
    }

    const ex = await prisma.checklistExecution.findFirst({
      where: mergeExecutionWhere({ id }, req),
      select: { id: true, osNumber: true },
    });
    if (!ex) return res.status(404).json({ error: 'OS não encontrada.' });

    const row = await prisma.checklistExecutionRevision.findUnique({
      where: {
        executionId_revision: { executionId: id, revision: revNum },
      },
    });
    if (!row) return res.status(404).json({ error: 'Revisão não encontrada.' });

    res.set('Cache-Control', 'no-store');
    res.json({
      executionId: id,
      osNumber: ex.osNumber,
      revision: row.revision,
      completedAt: row.completedAt,
      submissionId: row.submissionId,
      createdAt: row.createdAt,
      responses: row.responses,
      metadataSnapshot: row.metadataSnapshot,
      businessMetrics: row.businessMetrics ?? null,
    });
  } catch (err) {
    console.error('[operations/tasks/:id/revisions/:revision GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/operations/tasks/:id/revisions ─────────────────
// Histórico imutável por conclusão (CRM / auditoria)
router.get('/tasks/:id/revisions', async (req, res) => {
  try {
    const { id } = req.params;
    const ex = await prisma.checklistExecution.findFirst({
      where: mergeExecutionWhere({ id }, req),
      select: { id: true },
    });
    if (!ex) return res.status(404).json({ error: 'OS não encontrada.' });

    const revs = await prisma.checklistExecutionRevision.findMany({
      where: { executionId: id },
      orderBy: { revision: 'asc' },
      select: {
        id: true,
        revision: true,
        completedAt: true,
        submissionId: true,
        createdAt: true,
      },
    });

    res.set('Cache-Control', 'no-store');
    res.json(revs);
  } catch (err) {
    console.error('[operations/tasks/:id/revisions GET]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/operations/tasks/:id ─────────────────────────
// Cancels a PENDING OS (hard delete from DB)
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ex = await prisma.checklistExecution.findFirst({
      where: mergeExecutionWhere({ id }, req),
    });
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

// ─── POST /api/operations/tasks/:id/reopen-for-revision ───────
// Admin: reabre FT concluída para o destinatário (nova revisão; mesma FT). O app móvel não tem este endpoint.
router.post('/tasks/:id/reopen-for-revision', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.checklistExecution.findFirst({
      where: mergeExecutionWhere({ id }, req),
      include: { template: { select: { schemaData: true, tenantId: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'OS não encontrada.' });

    if (existing.routineTaskNumber != null && String(existing.routineTaskNumber).trim() !== '') {
      return res.status(400).json({ error: 'Tarefas de rotina (RT) não podem ser reabertas para revisão.' });
    }

    const st = String(existing.status || '').toUpperCase();
    if (!['COMPLETED', 'SYNCED'].includes(st)) {
      return res.status(400).json({ error: 'Só é possível reabrir OS concluídas ou sincronizadas.' });
    }

    const previousOwner = String(existing.ownerEmail || '').trim();
    let resolvedOwner = previousOwner;

    const rawTarget =
      req.body && typeof req.body.targetOwnerEmail === 'string' ? req.body.targetOwnerEmail.trim() : '';
    if (rawTarget && rawTarget.toLowerCase() !== previousOwner.toLowerCase()) {
      const templateTenantId = existing.template?.tenantId || null;
      const resolved = await resolveFieldTaskAssigneeEmail(
        prisma,
        rawTarget,
        templateTenantId || undefined
      );
      if (!resolved) {
        return res.status(400).json({
          error:
            'O e-mail indicado não corresponde a um usuário ativo elegível (contas cliente não recebem OS). Use o e-mail de login do app.',
        });
      }
      resolvedOwner = resolved;
    }

    let mergedMeta =
      typeof existing.metadata === 'object' && existing.metadata && !Array.isArray(existing.metadata)
        ? { ...existing.metadata }
        : {};
    const prevReopen = Number(mergedMeta.reopenCount) || 0;
    const ts = new Date().toISOString();
    mergedMeta.reopenedAt = ts;
    mergedMeta.reopenCount = prevReopen + 1;
    mergedMeta.reopenedByAdmin = true;
    mergedMeta.reopenedByAdminEmail = req.admin?.email || null;
    mergedMeta.reopenedByAdminAt = ts;
    if (resolvedOwner.toLowerCase() !== previousOwner.toLowerCase()) {
      mergedMeta.reassignedFromOwnerEmail = previousOwner;
      mergedMeta.reassignedToOwnerEmail = resolvedOwner;
      mergedMeta.reassignedAt = ts;
    }

    // Revisão: voltar ao fluxo "pendente" no app (aba Pendentes), não "Em andamento".
    for (const k of [
      'receivedAt',
      'acceptedAt',
      'executionPaused',
      'trackingStartedAt',
      'trackingEndedAt',
      'trackingPaused',
      'trackingUrl',
      'trackingToken',
    ]) {
      delete mergedMeta[k];
    }
    mergedMeta.reopenForRevisionPending = true;
    /** Mantém-se até nova submissão COMPLETED (o app mostra "revisão" durante toda a visita). */
    mergedMeta.revisionVisitActive = true;

    const stripped = stripResponsesForRevision(existing.responses, existing.template?.schemaData);

    const updateData = {
      ownerEmail: resolvedOwner,
      status: 'PENDING',
      responses: stripped,
      metadata: mergedMeta,
      completedAt: null,
      syncedAt: null,
      startedAt: null,
      etaMinutes: null,
      gpsLocation: null,
    };
    const selectOut = {
      id: true,
      status: true,
      ownerEmail: true,
      osNumber: true,
      lastSubmittedRevision: true,
    };

    let execution;
    try {
      execution = await prisma.checklistExecution.update({
        where: { id },
        data: { ...updateData, businessMetrics: null },
        select: selectOut,
      });
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (/businessMetrics/i.test(msg)) {
        execution = await prisma.checklistExecution.update({
          where: { id },
          data: updateData,
          select: selectOut,
        });
      } else {
        throw err;
      }
    }

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          action: 'OS_REOPENED_FOR_REVISION',
          resource: 'ChecklistExecution',
          category: 'ADMIN',
          metadata: {
            executionId: id,
            previousOwnerEmail: previousOwner,
            ownerEmail: resolvedOwner,
            osNumber: existing.osNumber || null,
            adminEmail: req.admin?.email || null,
          },
        },
      })
      .catch(() => {});

    const notifyEmail = String(resolvedOwner || '').trim();
    try {
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          email: { equals: notifyEmail, mode: 'insensitive' },
        },
        select: { id: true, email: true },
      });
      if (users.length === 0) {
        console.warn('[operations/reopen-for-revision] Push ignorado: nenhum User ativo para email', notifyEmail);
      } else {
        const userIds = users.map((u) => u.id);
        const pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: userIds } } });
        if (pushTokens.length === 0) {
          console.warn(
            '[operations/reopen-for-revision] Push ignorado: técnico sem token registrado (abra o app logado e conceda notificações). userIds=',
            userIds.join(',')
          );
        } else {
          const taskTitle =
            typeof mergedMeta.title === 'string' && mergedMeta.title.trim()
              ? mergedMeta.title.trim()
              : 'Ordem de serviço';
          const osNum = execution.osNumber ? String(execution.osNumber).trim() : '';
          const bodyLine = `A administração pediu uma nova revisão: ${taskTitle}`;
          const body =
            (osNum ? `${osNum} · ${bodyLine}` : bodyLine).slice(0, 200);
          /** Mesma categoria que o despacho de FT — botões Aceitar / Recusar / OK no iOS (expandir notificação). */
          const pushRes = await sendExpoPushToMany(pushTokens, {
            title: 'Nova revisão pedida',
            body,
            subtitle: 'Deslize para baixo — Aceitar, Recusar ou OK.',
            interruptionLevel: 'active',
            categoryId: 'BRSPARK_TECH_ACTIVITY',
            data: { taskId: id, type: 'os_reopened_revision' },
          });
          if (pushRes && pushRes.ok === false) {
            console.error('[operations/reopen-for-revision] Expo push falhou:', pushRes);
          } else {
            console.log(
              `[operations/reopen-for-revision] Push Expo: ${pushRes?.sent ?? '?'} ok / ${pushTokens.length} token(s)`
            );
          }
        }
      }
    } catch (pushErr) {
      console.error('[operations/reopen-for-revision] Push:', pushErr.message);
    }

    // Resposta leve: não incluir `responses` (pode ser MB em base64) — o painel só precisa de ok + ids.
    res.json({
      ok: true,
      id: execution.id,
      status: execution.status,
      ownerEmail: execution.ownerEmail,
      osNumber: execution.osNumber,
      lastSubmittedRevision: execution.lastSubmittedRevision,
    });
  } catch (err) {
    console.error('[operations/tasks/:id/reopen-for-revision POST]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
