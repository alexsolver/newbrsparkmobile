'use strict';

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { auditActor, auditContextMetadata } = require('../lib/auditActor');
const { isProviderFirstNetworkEnabled } = require('../lib/providerFirstNetwork');
const { deliverBrsparkLaravelEvent, EVENT_TYPES } = require('../lib/brsparkSyncWebhook');
const {
  assertTenantAccess,
  hasCapability,
  isPlatformAdmin,
  resolveScopedTenantId,
  nonPlatformUserReadWhere,
} = require('../lib/authorization');
const { escapeHtmlEmailFragment } = require('../lib/emailEscapeHtml');
const {
  ensureProviderIdentityForUserId,
  syncActiveAffiliationFromTechnicianStatus,
  reconcileAffiliationsToTechnicianProfilesForAppAccount,
  reconcileAffiliationRowsByIds,
  ensureAffiliationRowStatusesMatchTechnicianProfiles,
} = require('../lib/providerTechnicianAffiliationSync');
const { sendTransactionalEmailWithFallback } = require('../lib/transactionalEmailSend');
const { sendExpoPushToMany } = require('../services/expoPush');
const {
  onboardingStatusInclude,
  resolveMergedProviderIdentityForUserId,
} = require('../lib/providerIdentityMerge');
const { endSiblingAffiliationsSameTenantAppAccount } = require('../lib/providerAffiliationSiblingEnd');
const { invalidateAppEffectiveTenantIdCache } = require('../lib/appLoginEffectiveTenant');
const { parseDedicatedExclusiveFromTenantScheduleJson } = require('../lib/dedicatedExclusiveTime');
const {
  isHiddenFromCompanyDirectoryAt,
  isHiddenFromPublicDirectoryAt,
} = require('../lib/providerDedicatedExclusiveService');
const { hasActiveDedicatedAffiliationForAppUser } = require('../lib/providerOnboardingGuards');
const { resolveCanonicalEmailNormForUser } = require('../lib/userEmailUnique');

const publicRouter = express.Router();
const adminRouter = express.Router();

const GLOBAL_INVITE_PURPOSE = 'PROVIDER_GLOBAL_ONBOARDING_INVITE';
const GLOBAL_INVITE_TTL = Number(process.env.PROVIDER_GLOBAL_INVITE_TTL_SECONDS || 14 * 24 * 3600);
const AFFILIATION_ACCEPT_BASE_URL =
  String(process.env.PROVIDER_AFFILIATION_ACCEPT_URL_BASE || 'brsparkmobile://provider-affiliation/accept').trim();
const ONBOARDING_INVITE_BASE_URL =
  String(process.env.PROVIDER_GLOBAL_ONBOARDING_URL_BASE || 'brsparkmobile://provider-onboarding').trim();

const AFFILIATION_RELATIONSHIP_TYPES = new Set(['DEDICATED']);

const ONBOARDING_DEDICATED_ACTIVE_MSG =
  'Já existe um vínculo dedicado ativo. Não é necessário abrir ou submeter candidatura de onboarding por este fluxo.';

function respondOnboardingBlockedIfDedicated(res, hasDedicated) {
  if (!hasDedicated) return false;
  res.status(409).json({
    error: ONBOARDING_DEDICATED_ACTIVE_MSG,
    code: 'ONBOARDING_SKIP_DEDICATED_ACTIVE',
  });
  return true;
}

function normalizeEmail(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function mergeJsonResponses(existing, patch) {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const tech = patch.technician;
  if (tech && typeof tech === 'object' && !Array.isArray(tech)) {
    base.technician = {
      ...(base.technician && typeof base.technician === 'object' && !Array.isArray(base.technician)
        ? base.technician
        : {}),
      ...tech,
    };
  }
  for (const k of Object.keys(patch)) {
    if (k === 'technician') continue;
    base[k] = patch[k];
  }
  return base;
}

function resolveAdminTenantId(req, bodyTenantId = null) {
  return resolveScopedTenantId(req.authorization, bodyTenantId ? String(bodyTenantId).trim() : null);
}

function canAccessTenant(req, tenantId) {
  return assertTenantAccess(req.authorization, tenantId);
}

async function ensureProviderFirstEnabledOr403(res, tenantId) {
  const enabled = await isProviderFirstNetworkEnabled(tenantId);
  if (!enabled) {
    res.status(403).json({
      error: 'Fluxo provider-first desativado para este tenant.',
      code: 'PROVIDER_FIRST_DISABLED',
    });
    return false;
  }
  return true;
}

function ensureProviderIdentityForUser(userId) {
  return ensureProviderIdentityForUserId(prisma, userId, 'provider_first_onboarding');
}

async function findOrCreateEditableOnboardingApp(providerIdentityId, inviteToken) {
  const existing = await prisma.providerOnboardingApplication.findFirst({
    where: {
      providerIdentityId: String(providerIdentityId),
      status: { in: ['DRAFT', 'NEEDS_REVISION'] },
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) {
    if (inviteToken && !existing.inviteToken) {
      return prisma.providerOnboardingApplication.update({
        where: { id: existing.id },
        data: { inviteToken },
      });
    }
    return existing;
  }
  return prisma.providerOnboardingApplication.create({
    data: {
      providerIdentityId: String(providerIdentityId),
      status: 'DRAFT',
      inviteToken: inviteToken || null,
      responsesJson: {},
    },
  });
}

async function resolveProviderIdentityForAppUserId(userId, jwtEmailNorm = '') {
  return resolveMergedProviderIdentityForUserId(prisma, userId, jwtEmailNorm);
}

/** Convite de parceria pertence à sessão se for o mesmo User ou o mesmo AppAccount. */
async function sessionUserMayActAsProviderForAffiliation(reqUserId, providerIdentityUserId) {
  if (String(reqUserId) === String(providerIdentityUserId)) return true;
  const [sessionU, ownerU] = await Promise.all([
    prisma.user.findUnique({
      where: { id: String(reqUserId) },
      select: { appAccountId: true },
    }),
    prisma.user.findUnique({
      where: { id: String(providerIdentityUserId) },
      select: { appAccountId: true },
    }),
  ]);
  if (!sessionU?.appAccountId || !ownerU?.appAccountId) return false;
  return String(sessionU.appAccountId) === String(ownerU.appAccountId);
}

/** Carrega afiliação e valida sessão + provider-first no tenant; `res` já respondido em caso de erro. */
async function loadMeAffiliationRow(req, res, id) {
  const sid = String(id || '').trim();
  if (!sid) {
    res.status(400).json({ error: 'Identificador inválido.' });
    return null;
  }
  const row = await prisma.providerTenantAffiliation.findFirst({
    where: { id: sid },
    include: {
      providerIdentity: { include: { user: { select: { id: true, email: true, appAccountId: true } } } },
      tenant: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!row) {
    res.status(404).json({ error: 'Vínculo não encontrado.' });
    return null;
  }
  if (!(await sessionUserMayActAsProviderForAffiliation(req.user.id, row.providerIdentity.userId))) {
    res.status(403).json({
      error: 'Este vínculo não pertence à conta autenticada.',
      code: 'AFFILIATION_EMAIL_MISMATCH',
    });
    return null;
  }
  if (!(await ensureProviderFirstEnabledOr403(res, row.tenantId))) return null;
  return row;
}

function dedicatedExclusiveForAppPayload(row) {
  const parsed = parseDedicatedExclusiveFromTenantScheduleJson(row?.tenantScheduleJson);
  if (!parsed) return null;
  return { timezone: parsed.timezone, weeklyWindows: parsed.weeklyWindows };
}

function affiliationPayloadFromRow(row, extra = {}) {
  return {
    id: row.id,
    status: row.status,
    relationshipType: row.relationshipType || 'DEDICATED',
    note: row.note,
    tenant: row.tenant,
    invitedAt: row.invitedAt,
    requestedAt: row.requestedAt,
    activatedAt: row.activatedAt,
    endedAt: row.endedAt,
    suspendedAt: row.suspendedAt,
    dedicatedExclusive: dedicatedExclusiveForAppPayload(row),
    ...extra,
  };
}

/** Prestador ACTIVE no painel sem linha em ProviderTenantAffiliation — preenche ao abrir a app. */
async function maybeBackfillAffiliationForActiveTechnician(userId, tenantId) {
  const uid = String(userId || '').trim();
  const tid = String(tenantId || '').trim();
  if (!uid || !tid) return;
  const tp = await prisma.technicianProfile.findUnique({
    where: { userId: uid },
    select: { status: true },
  });
  if (!tp || String(tp.status || '').toUpperCase() !== 'ACTIVE') return;
  const u = await prisma.user.findUnique({
    where: { id: uid },
    select: { tenantId: true, tenant: { select: { kind: true } } },
  });
  if (!u || String(u.tenantId || '') !== tid) return;
  await syncActiveAffiliationFromTechnicianStatus(prisma, {
    userId: uid,
    tenantId: tid,
    tenantKind: u.tenant?.kind,
  }).catch(() => {});
}

// GET /api/providers/me/onboarding/status
publicRouter.get('/me/onboarding/status', authUser, async (req, res) => {
  try {
    // Não usar `ensureProviderFirstEnabledOr403(req.user.tenantId)` aqui: o JWT traz o tenant
    // «principal» do utilizador; o convite vem de outra empresa com provider-first ativo.
    // Bloquear pela sessão impedia ver afiliações INVITED na app (Organizações e parcerias).
    const emailNormSession = normalizeEmail(req.user.email || '');
    try {
      const rec = await reconcileAffiliationsToTechnicianProfilesForAppAccount(
        prisma,
        req.user.id,
        emailNormSession
      );
      if (rec.updated > 0) invalidateAppEffectiveTenantIdCache(req.user.id);
    } catch (e) {
      console.error('[GET /providers/me/onboarding/status] reconcile affiliations:', e?.message || e);
    }
    let providerIdentity = await resolveProviderIdentityForAppUserId(req.user.id, emailNormSession);
    const sessionTid = String(req.user.tenantId || '').trim();
    if (
      sessionTid &&
      (!providerIdentity || !(providerIdentity.affiliations && providerIdentity.affiliations.length))
    ) {
      await maybeBackfillAffiliationForActiveTechnician(req.user.id, sessionTid);
      providerIdentity = await resolveProviderIdentityForAppUserId(req.user.id, emailNormSession);
    }
    try {
      const affIds = (providerIdentity?.affiliations || []).map((a) => a.id).filter(Boolean);
      const recRows = await reconcileAffiliationRowsByIds(
        prisma,
        affIds,
        req.user.id,
        emailNormSession
      );
      if (recRows.updated > 0) {
        invalidateAppEffectiveTenantIdCache(req.user.id);
        providerIdentity = await resolveProviderIdentityForAppUserId(req.user.id, emailNormSession);
      }
    } catch (e) {
      console.error('[GET /providers/me/onboarding/status] reconcile affiliation rows by id:', e?.message || e);
    }
    if (!providerIdentity) {
      return res.json({
        providerIdentity: null,
        onboarding: null,
        affiliations: [],
      });
    }
    const latest = providerIdentity.applications[0] || null;
    /**
     * Ocultar só espaços pessoais (CLIENT/PROVIDER). Incluir COMPANY e convites cujo `kind` ainda
     * venha vazio ou fora de sync (evita lista vazia em «Organizações e parcerias»).
     */
    const affiliationsForApp = (providerIdentity.affiliations || []).filter((row) => {
      if (String(row.relationshipType || '').toUpperCase() === 'OWNER') return false;
      const k = String(row.tenant?.kind || '').toUpperCase();
      if (k === 'CLIENT' || k === 'PROVIDER') return false;
      return true;
    });
    const aligned = await ensureAffiliationRowStatusesMatchTechnicianProfiles(
      prisma,
      affiliationsForApp,
      req.user.id,
      emailNormSession
    );
    if (aligned.persistedCount > 0) invalidateAppEffectiveTenantIdCache(req.user.id);

    const skipSelfServiceOnboarding = await hasActiveDedicatedAffiliationForAppUser(
      prisma,
      req.user.id
    );

    return res.json({
      providerIdentity: {
        id: providerIdentity.id,
        globalStatus: providerIdentity.globalStatus,
        kycStatus: providerIdentity.kycStatus,
        kycReviewNote: providerIdentity.kycReviewNote,
        updatedAt: providerIdentity.updatedAt,
      },
      onboarding: latest
        ? {
            id: latest.id,
            status: latest.status,
            revisionNote: latest.revisionNote,
            submittedAt: latest.submittedAt,
            updatedAt: latest.updatedAt,
          }
        : null,
      /** `true` quando já existe DEDICATED+ACTIVE: o autoatendimento de onboarding global não deve ser oferecido. */
      skipSelfServiceOnboarding,
      affiliations: aligned.rows.map((row) => affiliationPayloadFromRow(row)),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/me/affiliations/:id/accept
// Mesmo efeito que POST /affiliations/:token/accept, sem expor invitationToken na lista.
publicRouter.post('/me/affiliations/:id/accept', authUser, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
    const row = await prisma.providerTenantAffiliation.findFirst({
      where: { id },
      include: {
        providerIdentity: {
          include: { user: { select: { id: true, email: true } } },
        },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Vínculo não encontrado.' });
    if (!(await sessionUserMayActAsProviderForAffiliation(req.user.id, row.providerIdentity.userId))) {
      return res.status(403).json({
        error: 'Este convite não pertence à conta autenticada.',
        code: 'AFFILIATION_EMAIL_MISMATCH',
      });
    }
    if (String(row.status || '').toUpperCase() !== 'INVITED') {
      return res.status(409).json({
        error: 'Este convite já não está pendente de aceitação.',
        code: 'AFFILIATION_NOT_INVITED',
      });
    }
    if (!(await ensureProviderFirstEnabledOr403(res, row.tenantId))) return;
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: {
        status: 'REQUESTED',
        requestedAt: new Date(),
        invitationToken: null,
      },
    });
    invalidateAppEffectiveTenantIdCache(req.user.id);
    return res.json({
      ok: true,
      affiliation: {
        id: updated.id,
        status: updated.status,
        relationshipType: updated.relationshipType || 'DEDICATED',
        tenant: row.tenant,
        requestedAt: updated.requestedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/me/affiliations/:id/decline — convite INVITED → REJECTED
publicRouter.post('/me/affiliations/:id/decline', authUser, async (req, res) => {
  try {
    const row = await loadMeAffiliationRow(req, res, req.params.id);
    if (!row) return;
    const st = String(row.status || '').toUpperCase();
    if (st !== 'INVITED') {
      return res.status(409).json({
        error: 'Só é possível recusar um convite pendente.',
        code: 'AFFILIATION_INVALID_STATE',
      });
    }
    const now = new Date();
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: {
        status: 'REJECTED',
        invitationToken: null,
        endedAt: now,
      },
    });
    invalidateAppEffectiveTenantIdCache(req.user.id);
    return res.json({ ok: true, affiliation: affiliationPayloadFromRow({ ...row, ...updated }) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/me/affiliations/:id/suspend — ACTIVE → SUSPENDED
publicRouter.post('/me/affiliations/:id/suspend', authUser, async (req, res) => {
  try {
    const row = await loadMeAffiliationRow(req, res, req.params.id);
    if (!row) return;
    const st = String(row.status || '').toUpperCase();
    if (st !== 'ACTIVE') {
      return res.status(409).json({
        error: 'Só é possível suspender um vínculo ativo.',
        code: 'AFFILIATION_INVALID_STATE',
      });
    }
    const now = new Date();
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: { status: 'SUSPENDED', suspendedAt: now },
    });
    invalidateAppEffectiveTenantIdCache(req.user.id);
    return res.json({ ok: true, affiliation: affiliationPayloadFromRow({ ...row, ...updated }) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/me/affiliations/:id/resume — SUSPENDED → ACTIVE
publicRouter.post('/me/affiliations/:id/resume', authUser, async (req, res) => {
  try {
    const row = await loadMeAffiliationRow(req, res, req.params.id);
    if (!row) return;
    const st = String(row.status || '').toUpperCase();
    if (st !== 'SUSPENDED') {
      return res.status(409).json({
        error: 'Só é possível reativar um vínculo suspenso.',
        code: 'AFFILIATION_INVALID_STATE',
      });
    }
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: { status: 'ACTIVE', suspendedAt: null },
    });
    invalidateAppEffectiveTenantIdCache(req.user.id);
    return res.json({ ok: true, affiliation: affiliationPayloadFromRow({ ...row, ...updated }) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/me/affiliations/:id/end — pedido ou operação encerrada pelo prestador
publicRouter.post('/me/affiliations/:id/end', authUser, async (req, res) => {
  try {
    const row = await loadMeAffiliationRow(req, res, req.params.id);
    if (!row) return;
    const st = String(row.status || '').toUpperCase();
    if (!['REQUESTED', 'ACTIVE', 'SUSPENDED'].includes(st)) {
      return res.status(409).json({
        error: 'Este vínculo não pode ser encerrado no estado atual.',
        code: 'AFFILIATION_INVALID_STATE',
      });
    }
    const now = new Date();
    const appAccountId = row.providerIdentity?.user?.appAccountId || null;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.providerTenantAffiliation.update({
        where: { id: row.id },
        data: {
          status: 'INACTIVE',
          endedAt: now,
          suspendedAt: null,
        },
      });
      if (appAccountId) {
        await endSiblingAffiliationsSameTenantAppAccount(tx, {
          tenantId: row.tenantId,
          excludeAffiliationId: row.id,
          appAccountId,
          now,
        });
      }
      return u;
    });
    invalidateAppEffectiveTenantIdCache(req.user.id);
    return res.json({ ok: true, affiliation: affiliationPayloadFromRow({ ...row, ...updated }) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/me/onboarding/start
publicRouter.post('/me/onboarding/start', authUser, express.json(), async (req, res) => {
  try {
    if (!(await ensureProviderFirstEnabledOr403(res, req.user.tenantId))) return;
    const providerIdentity = await ensureProviderIdentityForUser(req.user.id);
    const inviteToken = String(req.body?.inviteToken || '').trim();
    if (inviteToken) {
      let payload;
      try {
        payload = jwt.verify(inviteToken, process.env.JWT_SECRET);
      } catch (_) {
        return res.status(400).json({ error: 'Convite inválido ou expirado.', code: 'INVITE_INVALID' });
      }
      if (payload?.purpose !== GLOBAL_INVITE_PURPOSE) {
        return res.status(400).json({ error: 'Convite inválido.', code: 'INVITE_INVALID' });
      }
      const invitedEmail = normalizeEmail(payload?.email);
      if (invitedEmail !== normalizeEmail(req.user.email)) {
        return res.status(403).json({
          error: 'Este convite foi emitido para outro e-mail.',
          code: 'INVITE_EMAIL_MISMATCH',
        });
      }
      const alreadyClaimed = await prisma.providerOnboardingApplication.findFirst({
        where: { inviteToken },
      });
      if (alreadyClaimed && String(alreadyClaimed.providerIdentityId) !== String(providerIdentity.id)) {
        return res.status(409).json({
          error: 'Este convite já foi utilizado por outra conta.',
          code: 'INVITE_ALREADY_CLAIMED',
        });
      }
    }

    if (
      respondOnboardingBlockedIfDedicated(
        res,
        await hasActiveDedicatedAffiliationForAppUser(prisma, req.user.id)
      )
    ) {
      return;
    }

    const app = await findOrCreateEditableOnboardingApp(providerIdentity.id, inviteToken || null);
    return res.json({
      ok: true,
      providerIdentityId: providerIdentity.id,
      onboarding: {
        id: app.id,
        status: app.status,
        revisionNote: app.revisionNote,
        responsesJson: app.responsesJson,
        updatedAt: app.updatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/providers/me/onboarding/draft
publicRouter.patch('/me/onboarding/draft', authUser, express.json(), async (req, res) => {
  try {
    if (!(await ensureProviderFirstEnabledOr403(res, req.user.tenantId))) return;
    const patch = req.body?.responsesJson;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Envie responsesJson com objeto válido.' });
    }
    const providerIdentity = await ensureProviderIdentityForUser(req.user.id);
    if (
      respondOnboardingBlockedIfDedicated(
        res,
        await hasActiveDedicatedAffiliationForAppUser(prisma, req.user.id)
      )
    ) {
      return;
    }
    const editable = await findOrCreateEditableOnboardingApp(providerIdentity.id, null);
    const nextResponses = mergeJsonResponses(editable.responsesJson, patch);
    const updated = await prisma.providerOnboardingApplication.update({
      where: { id: editable.id },
      data: { responsesJson: nextResponses },
    });
    return res.json({
      ok: true,
      onboarding: {
        id: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/me/onboarding/submit
publicRouter.post('/me/onboarding/submit', authUser, express.json(), async (req, res) => {
  try {
    if (!(await ensureProviderFirstEnabledOr403(res, req.user.tenantId))) return;
    const providerIdentity = await ensureProviderIdentityForUser(req.user.id);
    if (
      respondOnboardingBlockedIfDedicated(
        res,
        await hasActiveDedicatedAffiliationForAppUser(prisma, req.user.id)
      )
    ) {
      return;
    }
    const editable = await findOrCreateEditableOnboardingApp(providerIdentity.id, null);
    if (editable.status === 'SUBMITTED') return res.json({ ok: true, status: 'SUBMITTED' });
    const updated = await prisma.providerOnboardingApplication.update({
      where: { id: editable.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        resolvedAt: null,
      },
    });
    deliverBrsparkLaravelEvent({
      type: EVENT_TYPES.ONBOARDING_SUBMITTED,
      idempotencyKey: `onboarding-${updated.id}-submitted`,
      payload: {
        userId: String(req.user.id),
        applicationId: updated.id,
        providerIdentityId: String(providerIdentity.id),
        status: updated.status,
      },
    }).catch((e) => console.warn('[providers] sync onboarding.submitted', e));
    return res.json({ ok: true, status: updated.status, submittedAt: updated.submittedAt });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/affiliations/:token/accept
publicRouter.post('/affiliations/:token/accept', authUser, async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token inválido.' });
    const row = await prisma.providerTenantAffiliation.findFirst({
      where: { invitationToken: token },
      include: {
        providerIdentity: {
          include: {
            user: { select: { id: true, email: true } },
          },
        },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Convite não encontrado.' });
    if (!(await ensureProviderFirstEnabledOr403(res, row.tenantId))) return;
    if (!(await sessionUserMayActAsProviderForAffiliation(req.user.id, row.providerIdentity.userId))) {
      return res.status(403).json({
        error: 'Este convite não pertence à conta autenticada.',
        code: 'AFFILIATION_EMAIL_MISMATCH',
      });
    }
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: {
        status: 'REQUESTED',
        requestedAt: new Date(),
        invitationToken: null,
      },
    });
    return res.json({
      ok: true,
      affiliation: {
        id: updated.id,
        status: updated.status,
        relationshipType: updated.relationshipType || 'DEDICATED',
        tenant: row.tenant,
        requestedAt: updated.requestedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/providers/affiliations/:token
// Pré-visualização do convite (antes do aceite).
publicRouter.get('/affiliations/:token', authUser, async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token inválido.' });
    const row = await prisma.providerTenantAffiliation.findFirst({
      where: { invitationToken: token },
      include: {
        providerIdentity: { include: { user: { select: { id: true, email: true } } } },
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Convite não encontrado.' });
    if (!(await ensureProviderFirstEnabledOr403(res, row.tenantId))) return;
    if (!(await sessionUserMayActAsProviderForAffiliation(req.user.id, row.providerIdentity.userId))) {
      return res.status(403).json({
        error: 'Este convite não pertence à conta autenticada.',
        code: 'AFFILIATION_EMAIL_MISMATCH',
      });
    }
    return res.json({
      ok: true,
      affiliation: {
        id: row.id,
        status: row.status,
        relationshipType: row.relationshipType || 'DEDICATED',
        note: row.note,
        tenant: row.tenant,
        invitedAt: row.invitedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/onboarding/invite
adminRouter.post('/onboarding/invite', express.json(), async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });
    const inviterTenantId = resolveAdminTenantId(req, req.body?.tenantId);
    if (inviterTenantId && !canAccessTenant(req, inviterTenantId)) {
      return res.status(403).json({ error: 'Sem permissão para este tenant.' });
    }
    if (inviterTenantId && !(await ensureProviderFirstEnabledOr403(res, inviterTenantId))) return;

    const payload = {
      purpose: GLOBAL_INVITE_PURPOSE,
      email,
      inviterTenantId: inviterTenantId || null,
      issuedAt: new Date().toISOString(),
      byUserId: req.admin?.userId || null,
      byAdminId: req.admin?.id || null,
    };
    const inviteToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: GLOBAL_INVITE_TTL });
    const inviteUrl = `${ONBOARDING_INVITE_BASE_URL}${ONBOARDING_INVITE_BASE_URL.includes('?') ? '&' : '?'}inviteToken=${encodeURIComponent(inviteToken)}`;

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: inviterTenantId || null,
          action: 'PROVIDER_ONBOARDING_INVITE_CREATE',
          resource: email,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            inviterTenantId: inviterTenantId || null,
            targetTenantId: inviterTenantId || null,
          }),
        },
      })
      .catch(() => {});

    return res.status(201).json({
      ok: true,
      email,
      inviteToken,
      inviteUrl,
      expiresInSeconds: GLOBAL_INVITE_TTL,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/affiliations/invite
adminRouter.post('/affiliations/invite', express.json(), async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório.' });
    }
    const tenantId = resolveAdminTenantId(req, req.body?.tenantId);
    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId é obrigatório para convite de parceria.',
      });
    }
    if (!canAccessTenant(req, tenantId)) {
      return res.status(403).json({ error: 'Sem permissão para este tenant.' });
    }
    if (!(await ensureProviderFirstEnabledOr403(res, tenantId))) {
      return;
    }

    const providerInviteUserInclude = { select: { id: true, email: true, name: true, appAccountId: true } };
    let providers = await prisma.providerIdentity.findMany({
      where: {
        user: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      },
      include: {
        user: providerInviteUserInclude,
      },
      take: 3,
    });
    if (!providers.length) {
      const acc = await prisma.appAccount.findUnique({ where: { emailNorm: email }, select: { id: true } });
      if (acc) {
        providers = await prisma.providerIdentity.findMany({
          where: { user: { appAccountId: acc.id } },
          include: { user: providerInviteUserInclude },
          take: 3,
        });
      }
    }
    if (!providers.length) {
      return res.status(404).json({
        error: 'Prestador ainda não possui cadastro global concluído.',
        code: 'PROVIDER_NOT_FOUND',
      });
    }
    if (providers.length > 1) {
      return res.status(409).json({
        error: 'Mais de uma conta global encontrada para este e-mail. Resolva a duplicidade antes do convite.',
        code: 'PROVIDER_IDENTITY_AMBIGUOUS',
      });
    }
    const provider = providers[0];
    const adminInviteEmailTo = provider.user.appAccountId
      ? (await prisma.appAccount.findUnique({
            where: { id: String(provider.user.appAccountId) },
            select: { emailNorm: true },
          }))?.emailNorm || provider.user.email
      : provider.user.email;
    const adminInvitePushUserIds = provider.user.appAccountId
      ? (
          await prisma.user.findMany({
            where: { appAccountId: String(provider.user.appAccountId) },
            select: { id: true },
          })
        ).map((u) => u.id)
      : [String(provider.userId)];

    const relationshipTypeRaw0 = String(req.body?.relationshipType || 'DEDICATED').trim().toUpperCase();
    const relationshipTypeRaw = relationshipTypeRaw0 === 'PARTNER' ? 'DEDICATED' : relationshipTypeRaw0;
    const relationshipType = AFFILIATION_RELATIONSHIP_TYPES.has(relationshipTypeRaw)
      ? relationshipTypeRaw
      : null;
    if (!relationshipType) {
      return res.status(400).json({
        error: 'relationshipType inválido. O único vínculo prestador–empresa é DEDICATED (vínculo dedicado).',
        code: 'RELATIONSHIP_TYPE_INVALID',
      });
    }

    const invitationToken = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    const note = String(req.body?.note || '').trim();

    const row = await prisma.providerTenantAffiliation.upsert({
      where: {
        tenantId_providerIdentityId: {
          tenantId: String(tenantId),
          providerIdentityId: provider.id,
        },
      },
      create: {
        tenantId: String(tenantId),
        providerIdentityId: provider.id,
        status: 'INVITED',
        relationshipType,
        invitationToken,
        invitedAt: now,
        note: note || null,
        invitedByUserId: req.admin?.userId || null,
      },
      update: {
        status: 'INVITED',
        relationshipType,
        invitationToken,
        invitedAt: now,
        note: note || null,
        invitedByUserId: req.admin?.userId || null,
      },
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: String(tenantId),
          action: 'PROVIDER_AFFILIATION_INVITED',
          resource: adminInviteEmailTo,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            providerIdentityId: provider.id,
            affiliationId: row.id,
            targetTenantId: String(tenantId),
          }),
        },
      })
      .catch(() => {});

    const acceptUrl = `${AFFILIATION_ACCEPT_BASE_URL}${AFFILIATION_ACCEPT_BASE_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(invitationToken)}`;

    const tenantLabelRow = await prisma.tenant
      .findUnique({
        where: { id: String(tenantId) },
        select: { name: true, slug: true },
      })
      .catch(() => null);
    const tenantLabel = String(tenantLabelRow?.name || tenantLabelRow?.slug || tenantId).trim() || 'Empresa';

    const relPt = 'vínculo dedicado (full time)';

    const notify = {
      emailSent: false,
      emailSkipped: false,
      emailError: null,
      emailProvider: null,
      emailSkippedReason: null,
      pushSent: 0,
      pushErrors: 0,
      pushTokenCount: 0,
      pushFirstError: null,
    };
    try {
      const subject = `Convite BrSpark — ${tenantLabel}`;
      const text = `Olá,\n\nA empresa «${tenantLabel}» convidou-o para ${relPt} na rede BrSpark.\n\nAbra o link no telemóvel com a app BrSpark instalada:\n${acceptUrl}\n\nNo app: Perfil → Organizações e parcerias — o convite aparece como «Convite recebido» até aceitar.\n\nSe não esperava este convite, ignore.\n`;
      const html = `<p>Olá,</p><p>A empresa <strong>${escapeHtmlEmailFragment(tenantLabel)}</strong> convidou-o para <strong>${escapeHtmlEmailFragment(relPt)}</strong> na rede BrSpark.</p><p><a href="${escapeHtmlEmailFragment(acceptUrl)}">Abrir no app / aceitar convite</a></p><p style="font-size:13px;color:#555">Na app: <strong>Perfil</strong> → <strong>Organizações e parcerias</strong> — o estado aparece como «Convite recebido» até aceitar.</p><p style="font-size:12px;color:#888">Se o link não abrir, copie o endereço acima ou abra a app e atualize esse separador.</p>`;
      const { send, provider: emailProviderUsed } = await sendTransactionalEmailWithFallback({
        to: provider.user.email,
        subject,
        html,
        text,
      });
      notify.emailSent = !!send?.ok;
      notify.emailSkipped = !!send?.skipped;
      notify.emailProvider = emailProviderUsed || null;
      if (send?.reason) notify.emailSkippedReason = String(send.reason).slice(0, 500);
      if (!send?.ok && send?.error) notify.emailError = String(send.error).slice(0, 240);
      else if (!send?.ok && send?.skipped && send?.reason && !notify.emailError) {
        notify.emailError = String(send.reason).slice(0, 240);
      }
    } catch (e) {
      console.error('[providers/affiliations/invite] e-mail transacional:', e?.message || e);
      notify.emailError = String(e?.message || e).slice(0, 240);
    }

    try {
      const tokens = await prisma.pushToken.findMany({ where: { userId: { in: adminInvitePushUserIds } } });
      notify.pushTokenCount = tokens.length;
      if (tokens.length) {
        const pushRes = await sendExpoPushToMany(tokens, {
          channelId: 'brspark-tecnico',
          title: 'Convite — organizações e parcerias',
          body: `${tenantLabel}: novo convite (dedicado). Abra a app.`,
          data: {
            type: 'PROVIDER_AFFILIATION_INVITED',
            tenantId: String(tenantId),
            affiliationId: row.id,
            acceptUrl,
          },
        });
        notify.pushSent = Number(pushRes?.sent) || 0;
        notify.pushErrors = Number(pushRes?.errors) || 0;
        const bad = (pushRes.tickets || []).find((x) => x && x.status === 'error');
        if (bad) notify.pushFirstError = String(bad.message || 'erro Expo').slice(0, 200);
      }
    } catch (e) {
      console.error('[providers/affiliations/invite] Expo push:', e?.message || e);
    }

    return res.status(201).json({
      ok: true,
      affiliationId: row.id,
      providerIdentityId: provider.id,
      email: adminInviteEmailTo,
      invitationToken,
      acceptUrl,
      status: row.status,
      relationshipType: row.relationshipType || relationshipType,
      invitedAt: row.invitedAt,
      notify,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/affiliations/:id/activate
adminRouter.post('/affiliations/:id/activate', express.json(), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const row = await prisma.providerTenantAffiliation.findUnique({
      where: { id },
      include: {
        providerIdentity: {
          select: {
            id: true,
            kycStatus: true,
            userId: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    if (!row) return res.status(404).json({ error: 'Parceria não encontrada.' });
    if (!canAccessTenant(req, row.tenantId)) return res.status(403).json({ error: 'Sem permissão para este tenant.' });
    if (!(await ensureProviderFirstEnabledOr403(res, row.tenantId))) return;
    const lineKyc = String(row.providerIdentity?.kycStatus || '')
      .toUpperCase()
      .trim();
    if (lineKyc === 'REJECTED') {
      return res.status(409).json({
        error: 'KYC deste vínculo está rejeitado — não pode ativar.',
        code: 'KYC_REJECTED',
      });
    }
    const uid = String(row.providerIdentity?.userId || '').trim();
    const emailNorm = normalizeEmail(row.providerIdentity?.user?.email || '');
    const mergedPi = uid ? await resolveMergedProviderIdentityForUserId(prisma, uid, emailNorm) : null;
    const mergedKyc = String(mergedPi?.kycStatus || '')
      .toUpperCase()
      .trim();
    if (lineKyc !== 'APPROVED' && mergedKyc !== 'APPROVED') {
      return res.status(409).json({
        error: 'KYC global ainda não aprovado para este prestador.',
        code: 'KYC_NOT_APPROVED',
      });
    }
    const note = String(req.body?.note || '').trim();
    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();

      // Se este vínculo for DEDICATED, desativar automaticamente outras afiliações ativas do prestador.
      if (String(row.relationshipType || 'DEDICATED').toUpperCase() === 'DEDICATED') {
        await tx.providerTenantAffiliation.updateMany({
          where: {
            providerIdentityId: row.providerIdentityId,
            status: 'ACTIVE',
            id: { not: row.id },
          },
          data: {
            status: 'INACTIVE',
            endedAt: now,
            note: 'Desativado automaticamente: prestador ativado como dedicado em outra empresa.',
          },
        });
      }

      return tx.providerTenantAffiliation.update({
        where: { id: row.id },
        data: {
          status: 'ACTIVE',
          activatedAt: now,
          endedAt: null,
          note: note || row.note || null,
        },
      });
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: row.tenantId,
          action: 'PROVIDER_AFFILIATION_ACTIVATED',
          resource: row.id,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            providerIdentityId: row.providerIdentityId,
            targetTenantId: row.tenantId,
          }),
        },
      })
      .catch(() => {});

    invalidateAppEffectiveTenantIdCache(uid);
    return res.json({
      ok: true,
      affiliation: {
        id: updated.id,
        status: updated.status,
        relationshipType: updated.relationshipType || 'DEDICATED',
        activatedAt: updated.activatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/providers/affiliations/:id/end
// Encerrar vínculo (ex.: dedicação terminou). Mantém histórico.
adminRouter.post('/affiliations/:id/end', express.json(), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const row = await prisma.providerTenantAffiliation.findUnique({
      where: { id },
      include: { providerIdentity: { include: { user: { select: { appAccountId: true } } } } },
    });
    if (!row) return res.status(404).json({ error: 'Parceria não encontrada.' });
    if (!canAccessTenant(req, row.tenantId)) return res.status(403).json({ error: 'Sem permissão para este tenant.' });
    if (!(await ensureProviderFirstEnabledOr403(res, row.tenantId))) return;
    const note = String(req.body?.note || '').trim();
    const now = new Date();
    const appAccountId = row.providerIdentity?.user?.appAccountId || null;
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.providerTenantAffiliation.update({
        where: { id: row.id },
        data: {
          status: 'INACTIVE',
          endedAt: now,
          note: note || row.note || null,
        },
      });
      if (appAccountId) {
        await endSiblingAffiliationsSameTenantAppAccount(tx, {
          tenantId: row.tenantId,
          excludeAffiliationId: row.id,
          appAccountId,
          now,
        });
      }
      return u;
    });
    invalidateAppEffectiveTenantIdCache(String(row.providerIdentity?.userId || '').trim());
    return res.json({
      ok: true,
      affiliation: {
        id: updated.id,
        status: updated.status,
        relationshipType: updated.relationshipType || 'DEDICATED',
        endedAt: updated.endedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/** Diretório: utilizadores activos com perfil técnico OU identidade global de prestador; dedicado opcional (query). */
function scheduleHasEnabled(ws) {
  if (!ws || typeof ws !== 'object' || Array.isArray(ws)) return false;
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (const d of days) {
    const slot = ws[d];
    if (!slot) continue;
    if (Array.isArray(slot)) {
      if (slot.some((s) => s && typeof s === 'object' && s.enabled)) return true;
    } else if (typeof slot === 'object' && slot.enabled) return true;
  }
  return false;
}

function coverageHasArea(cov) {
  if (!cov || typeof cov !== 'object') return false;
  const r = Number(cov.radiusKm);
  if (Number.isFinite(r) && r > 0) return true;
  const hb = cov.homeBase;
  if (hb && typeof hb === 'object' && Number.isFinite(hb.latitude) && Number.isFinite(hb.longitude)) return true;
  return false;
}

function serviceLocationIdsArray(raw) {
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return Object.values(raw).map((x) => String(x));
  return [];
}

function canReadProviderDirectory(req) {
  const a = req.authorization;
  return (
    hasCapability(a, 'platform.users.read') ||
    hasCapability(a, 'tenant.users.read.any') ||
    hasCapability(a, 'tenant.users.read.self') ||
    hasCapability(a, 'tenant.technicianRegistration.read.any') ||
    hasCapability(a, 'tenant.technicianRegistration.read.self') ||
    hasCapability(a, 'tenant.providers.read.self')
  );
}

/**
 * Só aplica `tenantId` na query quando é vista **plataforma** com organização escolhida no filtro:
 * membros da tenant OU prestadores com afiliação a essa tenant (identidade global noutro `User.tenantId`).
 * Em sessão só-empresa, não restringir por `User.tenantId` — senão o diretório fica vazio (prestadores na app partilhada).
 */
function directoryDbTenantClause(tenantFilter, authorization) {
  const tf = String(tenantFilter || '').trim();
  if (!tf) return {};
  if (!isPlatformAdmin(authorization)) return {};
  return {
    OR: [
      { tenantId: tf },
      {
        providerIdentity: {
          affiliations: {
            some: {
              tenantId: tf,
              status: { notIn: ['REJECTED', 'INACTIVE'] },
            },
          },
        },
      },
    ],
  };
}

function rowMatchesDirectoryFilters(u, { qSearch, skill, locationId, hasSchedule, hasCoverage }) {
  const tp = u.technicianProfile;
  const pi = u.providerIdentity;
  if (!tp && !pi) return false;
  if (locationId && !tp) return false;
  if (hasSchedule === '1' && !tp) return false;
  if (hasCoverage === '1' && !tp) return false;
  if (qSearch) {
    const q = qSearch.toLowerCase();
    const emTech = u.email ? String(u.email).toLowerCase() : '';
    const emCanon = u.loginEmailNorm ? String(u.loginEmailNorm).toLowerCase() : '';
    const spec = tp?.specialty || pi?.specialty;
    const cft = tp?.cft || pi?.cft;
    const hit =
      emTech.includes(q) ||
      emCanon.includes(q) ||
      (u.name && String(u.name).toLowerCase().includes(q)) ||
      (spec && String(spec).toLowerCase().includes(q)) ||
      (cft && String(cft).toLowerCase().includes(q));
    if (!hit) return false;
  }
  if (skill) {
    const skillsSrc = tp?.skillsJson ?? pi?.skillsJson ?? '';
    const hay = JSON.stringify(skillsSrc).toLowerCase();
    if (!hay.includes(skill.toLowerCase())) return false;
  }
  if (locationId) {
    const ids = serviceLocationIdsArray(tp.serviceLocationIds);
    if (!ids.includes(String(locationId))) return false;
  }
  if (hasSchedule === '1' && !scheduleHasEnabled(tp.workScheduleJson)) return false;
  if (hasCoverage === '1' && !coverageHasArea(tp.serviceCoverageGeoJson)) return false;
  return true;
}

// GET /api/providers/panel/saas-provider-directory
adminRouter.get('/panel/saas-provider-directory', async (req, res) => {
  try {
    if (!canReadProviderDirectory(req)) {
      return res.status(403).json({ error: 'Sem permissão para consultar o diretório de prestadores.' });
    }
    const qTenant = req.query.tenantId != null ? String(req.query.tenantId).trim() : '';
    let tenantFilter;
    if (isPlatformAdmin(req.authorization)) {
      if (qTenant) {
        if (!assertTenantAccess(req.authorization, qTenant)) {
          return res.status(403).json({ error: 'Sem permissão para este tenant.' });
        }
        tenantFilter = qTenant;
      } else {
        // «Todas (plataforma)» não envia tenantId — não aplicar panelFilterTenantId do JWT (senão fica preso a uma org).
        tenantFilter = null;
      }
    } else {
      if (qTenant && !assertTenantAccess(req.authorization, qTenant)) {
        return res.status(403).json({ error: 'Sem permissão para este tenant.' });
      }
      tenantFilter = resolveScopedTenantId(req.authorization, qTenant || null);
    }

    const qSearch = req.query.q != null ? String(req.query.q).trim().slice(0, 200) : '';
    const skill = req.query.skill != null ? String(req.query.skill).trim().slice(0, 120) : '';
    const locationId = req.query.locationId != null ? String(req.query.locationId).trim() : '';
    const hasSchedule = String(req.query.hasSchedule || '').trim() === '1' ? '1' : '';
    const hasCoverage = String(req.query.hasCoverage || '').trim() === '1' ? '1' : '';
    const techStatus = req.query.techStatus != null ? String(req.query.techStatus).trim().slice(0, 32) : '';
    /** Lista completa ignorando janelas exclusivas do vínculo dedicado (auditoria / operações). */
    const includeDedicatedBound = String(req.query.includeDedicatedBound || '').trim() === '1';
    const at = new Date();

    const page = Math.max(1, Math.min(500, parseInt(String(req.query.page || '1'), 10) || 1));
    const pageSize = Math.max(10, Math.min(100, parseInt(String(req.query.pageSize || '50'), 10) || 50));
    const maxFetch = Math.min(5000, Math.max(500, page * pageSize + 800));

    const where = {
      isActive: true,
      ...directoryDbTenantClause(tenantFilter, req.authorization),
      AND: [],
    };
    if (techStatus) {
      where.AND.push({ technicianProfile: { is: { status: techStatus } } });
    } else {
      where.AND.push({
        OR: [{ technicianProfile: { isNot: null } }, { providerIdentity: { isNot: null } }],
      });
    }
    if (!isPlatformAdmin(req.authorization)) {
      where.AND.push(nonPlatformUserReadWhere(req.authorization));
    }

    const rows = await prisma.user.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: maxFetch,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
        updatedAt: true,
        appAccountId: true,
        appAccount: { select: { emailNorm: true } },
        tenant: { select: { id: true, name: true } },
        technicianProfile: {
          select: {
            status: true,
            specialty: true,
            cft: true,
            score: true,
            skillsJson: true,
            workScheduleJson: true,
            serviceLocationIds: true,
            serviceCoverageGeoJson: true,
            updatedAt: true,
          },
        },
        providerIdentity: {
          select: {
            id: true,
            globalStatus: true,
            specialty: true,
            cft: true,
            score: true,
            skillsJson: true,
            updatedAt: true,
            affiliations: {
              where: { relationshipType: 'DEDICATED', status: 'ACTIVE' },
              select: { tenantId: true, status: true, relationshipType: true, tenantScheduleJson: true },
            },
          },
        },
      },
    });

    const post = { qSearch, skill, locationId, hasSchedule, hasCoverage };
    const enriched = await Promise.all(
      rows.map(async (u) => ({
        ...u,
        loginEmailNorm: (await resolveCanonicalEmailNormForUser(prisma, u)) || '',
      })),
    );
    const filtered = enriched.filter((u) => {
      if (!rowMatchesDirectoryFilters(u, post)) return false;
      if (includeDedicatedBound) return true;
      const pi = u.providerIdentity;
      if (tenantFilter) {
        return !isHiddenFromCompanyDirectoryAt(pi, tenantFilter, at);
      }
      return !isHiddenFromPublicDirectoryAt(pi, at);
    });
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    const data = slice.map((u) => {
      const tp = u.technicianProfile;
      const pi = u.providerIdentity;
      return {
        userId: u.id,
        email: u.loginEmailNorm || u.email,
        name: u.name,
        role: u.role,
        tenantId: u.tenantId,
        tenantName: u.tenant?.name || null,
        updatedAt: u.updatedAt,
        technician: {
          status: tp?.status ?? pi?.globalStatus ?? null,
          specialty: tp?.specialty ?? pi?.specialty ?? null,
          cft: tp?.cft ?? pi?.cft ?? null,
          score: tp?.score ?? pi?.score ?? null,
          skillsJson: tp?.skillsJson ?? pi?.skillsJson ?? null,
          workScheduleJson: tp?.workScheduleJson ?? null,
          serviceLocationIds: tp?.serviceLocationIds ?? null,
          serviceCoverageGeoJson: tp?.serviceCoverageGeoJson ?? null,
          hasSchedule: scheduleHasEnabled(tp?.workScheduleJson),
          hasCoverageArea: coverageHasArea(tp?.serviceCoverageGeoJson),
          updatedAt: tp?.updatedAt ?? pi?.updatedAt ?? null,
        },
      };
    });

    return res.json({
      data,
      meta: {
        total,
        page,
        pageSize,
        fetchedFromDb: rows.length,
        maxFetch,
        capped: rows.length >= maxFetch,
        tenantScoped: !!tenantFilter,
        platformCrossTenant: isPlatformAdmin(req.authorization) && !tenantFilter,
        includeDedicatedBound,
        directoryEligibility: includeDedicatedBound
          ? 'all'
          : tenantFilter
            ? 'visibleOutsideDedicatedExclusiveWindowsForViewerTenant'
            : 'visibleOutsideDedicatedExclusiveWindowsGlobally',
      },
    });
  } catch (err) {
    console.error('GET /panel/saas-provider-directory', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = {
  publicRouter,
  adminRouter,
};
