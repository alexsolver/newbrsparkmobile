'use strict';

const prisma = require('../db');
const {
  normalizeEmail,
  canAppUserAccessFieldTaskExecution,
} = require('./fieldTaskExecutionAccess');

/**
 * Recusa convite BROADCAST+OPEN (app JWT via authUser — mesmo padrão que POST /executions/:id/claim).
 * Exportado para montagem explícita em `index.js` **antes** de `app.use('/api/checklists', …)` para evitar
 * 404 «Route not found» quando o pedido não entra no router de checklists.
 */
async function rejectBroadcastInviteFromApp(req, res) {
  try {
    let taskId = String(req.params?.taskId || '').trim();
    if (!taskId && req.body && typeof req.body === 'object') {
      taskId = String(req.body.taskId ?? req.body.executionId ?? '').trim();
    }
    const email = normalizeEmail(req.user?.email || '');
    const rawReason = req.body?.reason;
    const reasonText =
      typeof rawReason === 'string' && rawReason.trim().length > 0
        ? rawReason.trim()
        : 'Recusada pelo prestador na tela de oferta (broadcast).';
    if (!taskId || !email) {
      return res.status(400).json({ error: 'Sessão inválida.' });
    }

    const ex = await prisma.checklistExecution.findUnique({
      where: { id: taskId },
      include: { template: true },
    });
    if (!ex) return res.status(404).json({ error: 'OS não encontrada.' });
    if (!canAppUserAccessFieldTaskExecution(ex, email)) {
      return res.status(403).json({ error: 'Acesso negado a esta OS.' });
    }
    if (
      String(ex.assignmentMode || '').toUpperCase() !== 'BROADCAST' ||
      String(ex.claimStatus || '').toUpperCase() !== 'OPEN'
    ) {
      return res.status(409).json({
        error: 'Só é possível recusar convites em concorrência ainda abertos.',
        code: 'NOT_BROADCAST_OPEN',
      });
    }

    let meta =
      ex.metadata && typeof ex.metadata === 'object' && !Array.isArray(ex.metadata) ? { ...ex.metadata } : {};
    const declinedAt = new Date().toISOString();
    meta = {
      ...meta,
      rejectionReason: reasonText,
      rejectedAt: declinedAt,
      broadcastDeclinedByEmail: email,
      broadcastDeclinedAt: declinedAt,
    };

    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { status: 'REJECTED', metadata: meta },
    });

    await prisma.auditLog
      .create({
        data: {
          adminId: null,
          userId: req.user.id,
          tenantId: req.user.tenantId ?? ex.template?.tenantId ?? null,
          action: 'OS_REJECTED',
          resource: 'ChecklistExecution',
          category: 'DATA',
          metadata: { executionId: taskId, ownerEmail: ex.ownerEmail, reason: reasonText },
        },
      })
      .catch(() => {});

    return res.json({ success: true });
  } catch (err) {
    console.error('[reject-broadcast-invite]', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { rejectBroadcastInviteFromApp };
