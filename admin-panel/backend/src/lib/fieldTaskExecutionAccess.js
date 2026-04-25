'use strict';

const { FIELD_TASK_CONTEXT_TENANT_KEY } = require('./fieldTaskExecutionTenantScope');

/** @param {string|null|undefined} a @param {string|null|undefined} b */
function sameOwnerEmail(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function broadcastCandidateArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => normalizeEmail(x)).filter(Boolean);
  }
  return [];
}

function isFieldTaskBroadcastOpen(ex) {
  return String(ex?.assignmentMode || '').toUpperCase() === 'BROADCAST' && String(ex?.claimStatus || '').toUpperCase() === 'OPEN';
}

/**
 * Utilizador do app pode ver/editar esta execução FT?
 * - DIRECT: só o dono (ownerEmail).
 * - BROADCAST+OPEN: qualquer e-mail na lista de candidatos (até alguém fazer claim).
 * - BROADCAST+CLAIMED: só o dono após claim.
 */
function canAppUserAccessFieldTaskExecution(ex, userEmail) {
  if (!ex || !userEmail) return false;
  const em = normalizeEmail(userEmail);
  const mode = String(ex.assignmentMode || 'DIRECT').toUpperCase();
  if (mode === 'BROADCAST') {
    if (isFieldTaskBroadcastOpen(ex)) {
      const arr = broadcastCandidateArray(ex.broadcastCandidates);
      return arr.includes(em);
    }
    if (String(ex.claimStatus || '').toUpperCase() === 'CLAIMED' && ex.ownerEmail) {
      return sameOwnerEmail(ex.ownerEmail, em);
    }
    return false;
  }
  return sameOwnerEmail(ex.ownerEmail, em);
}

function normalizeBroadcastCandidateEmails(emails) {
  const out = new Set();
  for (const e of emails || []) {
    const n = normalizeEmail(e);
    if (n) out.add(n);
  }
  return [...out];
}

/**
 * Resolve execução FT para JWT app: dono DIRECT/BROADCAST já atribuído, ou BROADCAST OPEN se candidato.
 * @param {import('@prisma/client').PrismaClient} prismaClient
 */
async function findChecklistExecutionForAppUser(prismaClient, executionId, email, tenantId, select) {
  const id = String(executionId || '').trim();
  const em = String(email || '').trim();
  const tid = String(tenantId || '').trim();
  if (!id || !em) return null;

  const opt = select && typeof select === 'object' ? { select } : {};
  const ownerClause = { id, ownerEmail: { equals: em, mode: 'insensitive' } };

  /** Escopo de tenant: modelo da org, metadado de despacho, ou ativo (não usado aqui — só abre por id). */
  const tenantScopeFilter = (t) => ({
    OR: [
      { template: { tenantId: t } },
      { metadata: { path: [FIELD_TASK_CONTEXT_TENANT_KEY], equals: t } },
    ],
  });

  if (tid) {
    const strict = await prismaClient.checklistExecution.findFirst({
      where: { ...ownerClause, ...tenantScopeFilter(tid) },
      ...opt,
    });
    if (strict) return strict;
  }

  const broad = await prismaClient.checklistExecution.findFirst({
    where: {
      id,
      assignmentMode: 'BROADCAST',
      claimStatus: 'OPEN',
      ...(tid ? tenantScopeFilter(tid) : {}),
    },
    ...opt,
  });
  if (broad && canAppUserAccessFieldTaskExecution(broad, em)) {
    return broad;
  }

  return null;
}

module.exports = {
  sameOwnerEmail,
  normalizeEmail,
  broadcastCandidateArray,
  isFieldTaskBroadcastOpen,
  canAppUserAccessFieldTaskExecution,
  normalizeBroadcastCandidateEmails,
  findChecklistExecutionForAppUser,
};
