'use strict';

const express = require('express');
const prisma = require('../db');
const { resolveAdminTargetTenantId } = require('../lib/workTime');
const {
  reconcileRoutineBuffersForAssignment,
  clampSlots,
  cancelActiveRoutinesForAssignmentRemoval,
} = require('../lib/routineTaskMobileBuffer');
const { FIELD_TASK_ASSIGNEE_ROLES } = require('../lib/technicianEligibility');

const router = express.Router();

const REPORT_PAGE_SIZE_DEFAULT = 50;
const REPORT_PAGE_SIZE_MAX = 200;
const EXPORT_MAX = 5000;

function escapeCsvCell(val) {
  const s = val == null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeMenuLabel(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (s.length > 120) s = s.slice(0, 120);
  return s;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {string|null}
 */
function requireTenant(req, res) {
  const tenantId = resolveAdminTargetTenantId(req, req.query?.tenantId || req.body?.tenantId);
  if (!tenantId) {
    res.status(400).json({ error: 'Tenant ausente ou inválido para esta sessão.' });
    return null;
  }
  return tenantId;
}

/** Modelos de checklist utilizáveis como RT neste tenant (mesma regra que PATCH /users). */
async function assertTemplateForTenant(tx, templateId, tenantId) {
  return tx.checklistTemplate.findFirst({
    where: {
      id: templateId,
      isActive: true,
      OR: [{ tenantId }, { tenantId: null }],
    },
    select: { id: true, title: true },
  });
}

/** E-mails dos usuários do tenant (minúsculos) para filtrar execuções com modelo global. */
async function tenantUserEmailsLower(tenantId) {
  const rows = await prisma.user.findMany({
    where: { tenantId },
    select: { email: true },
  });
  return rows.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * @param {string} tenantId
 * @param {string[]} emailsLower
 * @param {{ templateId?: string, ownerEmailExact?: string, status?: string, q?: string, from?: string, to?: string }} filters
 */
function buildRtExecutionWhere(tenantId, emailsLower, filters) {
  const { templateId, ownerEmailExact, status, q, from, to } = filters;
  /** @type {import('@prisma/client').Prisma.ChecklistExecutionWhereInput['AND']} */
  const andList = [];
  /** @type {import('@prisma/client').Prisma.ChecklistExecutionWhereInput['OR']} */
  const scopeOr = [{ template: { is: { tenantId } } }];
  if (emailsLower.length) {
    scopeOr.push({
      AND: [
        { template: { is: { tenantId: null } } },
        { ownerEmail: { in: emailsLower, mode: 'insensitive' } },
      ],
    });
  }
  andList.push({ OR: scopeOr });

  if (templateId) andList.push({ templateId });
  if (status) andList.push({ status: String(status).trim() });
  if (ownerEmailExact) {
    andList.push({ ownerEmail: { equals: ownerEmailExact, mode: 'insensitive' } });
  }
  if (q) {
    const term = String(q).trim();
    if (term) {
      andList.push({
        OR: [
          { routineTaskNumber: { contains: term, mode: 'insensitive' } },
          { ownerEmail: { contains: term, mode: 'insensitive' } },
          { osNumber: { contains: term, mode: 'insensitive' } },
        ],
      });
    }
  }
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) andList.push({ completedAt: { gte: d } });
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) andList.push({ completedAt: { lte: d } });
  }

  return {
    routineTaskNumber: { not: null },
    AND: andList,
  };
}

/** GET /api/admin/routine-tasks/templates */
router.get('/templates', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const rows = await prisma.checklistTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
      select: { id: true, title: true, tenantId: true },
      orderBy: [{ title: 'asc' }],
    });
    res.json({ templates: rows });
  } catch (err) {
    console.error('[admin/routine-tasks/templates]', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/routine-tasks/technicians — todos os usuários da tenant (para escolher na lista).
 * A associação em massa só grava usuários ativos que não sejam clientes (papel ≠ USER).
 */
router.get('/technicians', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const rows = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, isActive: true, role: true },
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    });
    res.json({ technicians: rows });
  } catch (err) {
    console.error('[admin/routine-tasks/technicians]', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/routine-tasks/assignments */
router.get('/assignments', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const templateId = req.query.templateId ? String(req.query.templateId).trim() : '';
    const userId = req.query.userId ? String(req.query.userId).trim() : '';
    const where = { tenantId };
    if (templateId) where.templateId = templateId;
    if (userId) where.userId = userId;
    const rows = await prisma.routineTaskAssignment.findMany({
      where,
      orderBy: [{ userId: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: { select: { id: true, name: true, email: true, isActive: true } },
        template: { select: { id: true, title: true, isActive: true, tenantId: true } },
      },
    });
    const assignments = rows.map((row) => ({
      ...row,
      mobilePrefetchSlots: clampSlots(row.mobilePrefetchSlots ?? 1),
    }));
    res.json({ assignments });
  } catch (err) {
    console.error('[admin/routine-tasks/assignments GET]', err);
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/routine-tasks/assignments/bulk — associa um modelo a vários técnicos */
router.post('/assignments/bulk', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const templateId = req.body?.templateId != null ? String(req.body.templateId).trim() : '';
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const shouldSetMenuLabel = Object.prototype.hasOwnProperty.call(req.body || {}, 'menuLabel');
    const menuLabel = shouldSetMenuLabel ? normalizeMenuLabel(req.body.menuLabel) : undefined;
    if (!templateId || userIds.length === 0) {
      return res.status(400).json({ error: 'Indique templateId e pelo menos um userId.' });
    }

    const created = [];
    const updated = [];
    const skipped = [];

    await prisma.$transaction(async (tx) => {
      const tpl = await assertTemplateForTenant(tx, templateId, tenantId);
      if (!tpl) {
        const e = new Error('MODEL_NOT_FOUND');
        e.code = 'MODEL_NOT_FOUND';
        throw e;
      }

      const uniqueUserIds = [...new Set(userIds)];
      for (const userId of uniqueUserIds) {
        const user = await tx.user.findFirst({
          where: { id: userId, tenantId },
          select: { id: true, email: true, isActive: true, role: true },
        });
        if (!user) {
          skipped.push({ userId, reason: 'Utilizador não encontrado neste tenant.' });
          continue;
        }
        if (!user.isActive) {
          skipped.push({ userId, reason: 'Utilizador inativo.' });
          continue;
        }
        const roleNorm = String(user.role || '').toUpperCase();
        /** Regra explícita por papel na BD (evita falsos negativos de resolução por e-mail no bulk). */
        if (!FIELD_TASK_ASSIGNEE_ROLES.includes(roleNorm)) {
          skipped.push({
            userId,
            reason: `Só contas internas recebem RT (prestador, gestor, admin da organização ou SaaS). Papel atual: ${roleNorm || '—'}.`,
          });
          continue;
        }
        const existing = await tx.routineTaskAssignment.findUnique({
          where: { userId_templateId: { userId, templateId } },
        });
        if (existing) {
          if (shouldSetMenuLabel) {
            await tx.routineTaskAssignment.update({
              where: { id: existing.id },
              data: { menuLabel, tenantId },
            });
          }
          updated.push(existing.id);
          continue;
        }
        const agg = await tx.routineTaskAssignment.aggregate({
          where: { userId, tenantId },
          _max: { sortOrder: true },
        });
        const sortOrder = (agg._max.sortOrder ?? -1) + 1;
        const row = await tx.routineTaskAssignment.create({
          data: {
            tenantId,
            userId,
            templateId,
            menuLabel: shouldSetMenuLabel ? menuLabel : null,
            sortOrder,
          },
        });
        created.push(row.id);
      }
    });

    /** Pré-carga do buffer + push ao técnico logo após o bulk (não bloquear a resposta HTTP). */
    const assignmentIdsToReconcile = [...new Set([...created, ...updated])].filter(Boolean);
    if (assignmentIdsToReconcile.length) {
      setImmediate(() => {
        void (async () => {
          for (const assignmentId of assignmentIdsToReconcile) {
            try {
              const assign = await prisma.routineTaskAssignment.findFirst({
                where: { id: assignmentId, tenantId },
              });
              if (assign) {
                await reconcileRoutineBuffersForAssignment(prisma, assign);
              }
            } catch (e) {
              console.error('[admin/routine-tasks/assignments/bulk] reconcile async', assignmentId, e);
            }
          }
        })();
      });
    }

    res.status(201).json({ ok: true, created, updated, skipped });
  } catch (err) {
    if (err.code === 'MODEL_NOT_FOUND') {
      return res.status(400).json({ error: 'Modelo de formulário inválido ou inativo para este tenant.' });
    }
    console.error('[admin/routine-tasks/assignments/bulk]', err);
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/admin/routine-tasks/assignments/:id */
router.patch('/assignments/:id', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido.' });

    const row = await prisma.routineTaskAssignment.findFirst({
      where: { id, tenantId },
    });
    if (!row) return res.status(404).json({ error: 'Associação não encontrada.' });

    const data = {};
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'menuLabel')) {
      data.menuLabel = normalizeMenuLabel(req.body.menuLabel);
    }
    if (req.body?.sortOrder != null) {
      const n = Number(req.body.sortOrder);
      if (Number.isFinite(n)) data.sortOrder = Math.floor(n);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'mobilePrefetchSlots')) {
      data.mobilePrefetchSlots = clampSlots(req.body.mobilePrefetchSlots);
    }
    if (!Object.keys(data).length) {
      return res.status(400).json({ error: 'Nada para atualizar (menuLabel, sortOrder ou mobilePrefetchSlots).' });
    }
    const next = await prisma.routineTaskAssignment.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        template: { select: { id: true, title: true, isActive: true } },
      },
    });
    res.json({ assignment: next });
    // Pré-carga RT pode demorar (várias execuções); não bloquear a resposta HTTP do painel.
    setImmediate(() => {
      reconcileRoutineBuffersForAssignment(prisma, next).catch((e) => {
        console.error('[admin/routine-tasks/assignments PATCH] reconcile async', e);
      });
    });
  } catch (err) {
    console.error('[admin/routine-tasks/assignments PATCH]', err);
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/admin/routine-tasks/assignments/:id */
router.delete('/assignments/:id', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const full = await prisma.routineTaskAssignment.findFirst({
      where: { id, tenantId },
    });
    if (!full) return res.status(404).json({ error: 'Associação não encontrada.' });
    try {
      await cancelActiveRoutinesForAssignmentRemoval(prisma, full);
    } catch (e) {
      console.error('[admin/routine-tasks/assignments DELETE] cancel RT', e);
    }
    await prisma.routineTaskAssignment.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/routine-tasks/assignments DELETE]', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/routine-tasks/report */
router.get('/report', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const emailsLower = await tenantUserEmailsLower(tenantId);
    const templateId = req.query.templateId ? String(req.query.templateId).trim() : '';
    const status = req.query.status ? String(req.query.status).trim() : '';
    const q = req.query.q ? String(req.query.q).trim() : '';
    const from = req.query.from ? String(req.query.from).trim() : '';
    const to = req.query.to ? String(req.query.to).trim() : '';
    const userParam = req.query.userId ? String(req.query.userId).trim() : '';

    let ownerEmailExact = '';
    if (userParam) {
      if (userParam.includes('@')) {
        ownerEmailExact = userParam;
      } else {
        const u = await prisma.user.findFirst({
          where: { id: userParam, tenantId },
          select: { email: true },
        });
        if (!u) {
          let pageSize = parseInt(String(req.query.pageSize || REPORT_PAGE_SIZE_DEFAULT), 10) || REPORT_PAGE_SIZE_DEFAULT;
          pageSize = Math.min(REPORT_PAGE_SIZE_MAX, Math.max(1, pageSize));
          return res.json({
            total: 0,
            page: 1,
            pageSize,
            rows: [],
          });
        }
        ownerEmailExact = String(u.email || '').trim();
      }
    }

    const where = buildRtExecutionWhere(tenantId, emailsLower, {
      templateId,
      ownerEmailExact,
      status,
      q,
      from,
      to,
    });

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    let pageSize = parseInt(String(req.query.pageSize || REPORT_PAGE_SIZE_DEFAULT), 10) || REPORT_PAGE_SIZE_DEFAULT;
    pageSize = Math.min(REPORT_PAGE_SIZE_MAX, Math.max(1, pageSize));

    const [total, rows] = await Promise.all([
      prisma.checklistExecution.count({ where }),
      prisma.checklistExecution.findMany({
        where,
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          routineTaskNumber: true,
          ownerEmail: true,
          status: true,
          completedAt: true,
          createdAt: true,
          startedAt: true,
          lastSubmittedRevision: true,
          templateId: true,
          template: { select: { id: true, title: true, tenantId: true } },
        },
      }),
    ]);

    res.json({
      total,
      page,
      pageSize,
      rows,
    });
  } catch (err) {
    console.error('[admin/routine-tasks/report]', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/routine-tasks/report/export.csv */
router.get('/report/export.csv', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res);
    if (!tenantId) return;
    const emailsLower = await tenantUserEmailsLower(tenantId);
    const templateId = req.query.templateId ? String(req.query.templateId).trim() : '';
    const status = req.query.status ? String(req.query.status).trim() : '';
    const q = req.query.q ? String(req.query.q).trim() : '';
    const from = req.query.from ? String(req.query.from).trim() : '';
    const to = req.query.to ? String(req.query.to).trim() : '';
    const userParam = req.query.userId ? String(req.query.userId).trim() : '';

    let ownerEmailExact = '';
    if (userParam) {
      if (userParam.includes('@')) {
        ownerEmailExact = userParam;
      } else {
        const u = await prisma.user.findFirst({
          where: { id: userParam, tenantId },
          select: { email: true },
        });
        if (!u) {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8');
          return res.send('\uFEFF' + escapeCsvCell('RT') + ',' + escapeCsvCell('E-mail técnico') + '\n');
        }
        ownerEmailExact = String(u.email || '').trim();
      }
    }

    const where = buildRtExecutionWhere(tenantId, emailsLower, {
      templateId,
      ownerEmailExact,
      status,
      q,
      from,
      to,
    });

    const rows = await prisma.checklistExecution.findMany({
      where,
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      take: EXPORT_MAX,
      select: {
        routineTaskNumber: true,
        ownerEmail: true,
        status: true,
        completedAt: true,
        createdAt: true,
        template: { select: { title: true } },
      },
    });

    const header = ['RT', 'E-mail técnico', 'Estado', 'Concluído em', 'Criado em', 'Modelo'];
    const lines = [header.map(escapeCsvCell).join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.routineTaskNumber,
          r.ownerEmail,
          r.status,
          r.completedAt ? r.completedAt.toISOString() : '',
          r.createdAt ? r.createdAt.toISOString() : '',
          r.template?.title || '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rt_relatorio_${tenantId.slice(0, 8)}.csv"`);
    res.send('\uFEFF' + lines.join('\n'));
  } catch (err) {
    console.error('[admin/routine-tasks/report/export]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
