'use strict';

const { FIELD_TASK_CONTEXT_TENANT_KEY } = require('./fieldTaskExecutionTenantScope');
const { resolveFieldTaskOwnerEmailCandidatesForAppUser } = require('./userEmailUnique');

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
 * E-mails que devem bater com `ownerEmail` / candidatos broadcast (JWT + linhas `User` do mesmo `AppAccount`).
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {string} jwtEmail
 * @param {string} [appUserId]
 */
async function resolveAppUserOwnerEmailKeys(prismaClient, jwtEmail, appUserId) {
  const norm = normalizeEmail(jwtEmail);
  const keys = new Set(norm ? [norm] : []);
  const uid = String(appUserId || '').trim();
  if (uid) {
    try {
      const cands = await resolveFieldTaskOwnerEmailCandidatesForAppUser(prismaClient, uid);
      for (const c of cands) {
        const n = normalizeEmail(c);
        if (n) keys.add(n);
      }
    } catch {
      /* ignore */
    }
  }
  return [...keys];
}

/**
 * Utilizador do app pode ver/editar esta execução FT?
 * - DIRECT: só o dono (ownerEmail).
 * - BROADCAST+OPEN: qualquer e-mail na lista de candidatos (até alguém fazer claim).
 * - BROADCAST+CLAIMED: só o dono após claim.
 *
 * @param {string[]|undefined} [ownerKeysOptional] — lista completa (JWT + e-mails `User` do mesmo `AppAccount`);
 *   se omitido, usa só `userEmail` (retrocompatível).
 */
function canAppUserAccessFieldTaskExecution(ex, userEmail, ownerKeysOptional) {
  if (!ex) return false;
  /** @type {Set<string>} */
  let emails;
  if (Array.isArray(ownerKeysOptional) && ownerKeysOptional.length > 0) {
    emails = new Set(ownerKeysOptional.map((x) => normalizeEmail(x)).filter(Boolean));
  } else {
    const em = normalizeEmail(userEmail);
    if (!em) return false;
    emails = new Set([em]);
  }
  if (emails.size === 0) return false;

  const mode = String(ex.assignmentMode || 'DIRECT').toUpperCase();
  if (mode === 'BROADCAST') {
    if (isFieldTaskBroadcastOpen(ex)) {
      const arr = broadcastCandidateArray(ex.broadcastCandidates);
      for (const e of emails) {
        if (arr.includes(e)) return true;
      }
      return false;
    }
    if (String(ex.claimStatus || '').toUpperCase() === 'CLAIMED' && ex.ownerEmail) {
      for (const e of emails) {
        if (sameOwnerEmail(ex.ownerEmail, e)) return true;
      }
      return false;
    }
    return false;
  }
  for (const e of emails) {
    if (sameOwnerEmail(ex.ownerEmail, e)) return true;
  }
  return false;
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
 * @param {{ appUserId?: string }} [options] — com `appUserId`, `ownerEmail` pode coincidir com e-mail técnico
 *   sintético da mesma conta (`User.email`) embora o JWT leve `AppAccount.emailNorm`.
 */
async function findChecklistExecutionForAppUser(prismaClient, executionId, email, tenantId, select, options = {}) {
  const id = String(executionId || '').trim();
  const em = String(email || '').trim();
  const tid = String(tenantId || '').trim();
  const appUserId = options.appUserId != null ? String(options.appUserId).trim() : '';
  if (!id || !em) return null;

  const ownerKeys = await resolveAppUserOwnerEmailKeys(prismaClient, em, appUserId);
  if (!ownerKeys.length) return null;

  const ownerMatch =
    ownerKeys.length === 1
      ? { ownerEmail: { equals: ownerKeys[0], mode: 'insensitive' } }
      : { OR: ownerKeys.map((e) => ({ ownerEmail: { equals: e, mode: 'insensitive' } })) };

  const opt = select && typeof select === 'object' ? { select } : {};

  /** Escopo de tenant: modelo da org, metadado de despacho, ou ativo (não usado aqui — só abre por id). */
  const tenantScopeFilter = (t) => ({
    OR: [
      { template: { tenantId: t } },
      { metadata: { path: [FIELD_TASK_CONTEXT_TENANT_KEY], equals: t } },
    ],
  });

  if (tid) {
    const strict = await prismaClient.checklistExecution.findFirst({
      where: {
        AND: [{ id, ...ownerMatch }, tenantScopeFilter(tid)],
      },
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
  if (broad && canAppUserAccessFieldTaskExecution(broad, em, ownerKeys)) {
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
  resolveAppUserOwnerEmailKeys,
};
