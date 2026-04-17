'use strict';

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { auditActor, auditContextMetadata } = require('../lib/auditActor');
const { isProviderFirstNetworkEnabled } = require('../lib/providerFirstNetwork');
const { assertTenantAccess, resolveScopedTenantId } = require('../lib/authorization');

const publicRouter = express.Router();
const adminRouter = express.Router();

const GLOBAL_INVITE_PURPOSE = 'PROVIDER_GLOBAL_ONBOARDING_INVITE';
const GLOBAL_INVITE_TTL = Number(process.env.PROVIDER_GLOBAL_INVITE_TTL_SECONDS || 14 * 24 * 3600);
const AFFILIATION_ACCEPT_BASE_URL =
  String(process.env.PROVIDER_AFFILIATION_ACCEPT_URL_BASE || 'brspark://provider-affiliation/accept').trim();
const ONBOARDING_INVITE_BASE_URL =
  String(process.env.PROVIDER_GLOBAL_ONBOARDING_URL_BASE || 'brspark://provider-onboarding').trim();

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

async function ensureProviderIdentityForUser(userId) {
  return prisma.providerIdentity.upsert({
    where: { userId: String(userId) },
    create: {
      userId: String(userId),
      globalStatus: 'PENDING',
      kycStatus: 'PENDING',
      profileJson: { source: 'provider_first_onboarding' },
    },
    update: {},
  });
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

// GET /api/providers/me/onboarding/status
publicRouter.get('/me/onboarding/status', authUser, async (req, res) => {
  try {
    if (!(await ensureProviderFirstEnabledOr403(res, req.user.tenantId))) return;
    const providerIdentity = await prisma.providerIdentity.findUnique({
      where: { userId: req.user.id },
      include: {
        applications: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
        },
        affiliations: {
          orderBy: [{ updatedAt: 'desc' }],
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
      },
    });
    if (!providerIdentity) {
      return res.json({
        providerIdentity: null,
        onboarding: null,
        affiliations: [],
      });
    }
    const latest = providerIdentity.applications[0] || null;
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
      affiliations: providerIdentity.affiliations.map((row) => ({
        id: row.id,
        status: row.status,
        note: row.note,
        tenant: row.tenant,
        invitedAt: row.invitedAt,
        requestedAt: row.requestedAt,
        activatedAt: row.activatedAt,
      })),
    });
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
    if (String(row.providerIdentity.userId) !== String(req.user.id)) {
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
        tenant: row.tenant,
        requestedAt: updated.requestedAt,
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
    if (!email) return res.status(400).json({ error: 'E-mail é obrigatório.' });
    const tenantId = resolveAdminTenantId(req, req.body?.tenantId);
    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId é obrigatório para convite de parceria.',
      });
    }
    if (!canAccessTenant(req, tenantId)) return res.status(403).json({ error: 'Sem permissão para este tenant.' });
    if (!(await ensureProviderFirstEnabledOr403(res, tenantId))) return;

    const providers = await prisma.providerIdentity.findMany({
      where: {
        user: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
      take: 3,
    });
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
        invitationToken,
        invitedAt: now,
        note: note || null,
        invitedByUserId: req.admin?.userId || null,
      },
      update: {
        status: 'INVITED',
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
          resource: provider.user.email,
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

    return res.status(201).json({
      ok: true,
      affiliationId: row.id,
      providerIdentityId: provider.id,
      email: provider.user.email,
      invitationToken,
      acceptUrl,
      status: row.status,
      invitedAt: row.invitedAt,
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
        providerIdentity: { select: { id: true, kycStatus: true } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Parceria não encontrada.' });
    if (!canAccessTenant(req, row.tenantId)) return res.status(403).json({ error: 'Sem permissão para este tenant.' });
    if (!(await ensureProviderFirstEnabledOr403(res, row.tenantId))) return;
    if (String(row.providerIdentity.kycStatus) !== 'APPROVED') {
      return res.status(409).json({
        error: 'KYC global ainda não aprovado para este prestador.',
        code: 'KYC_NOT_APPROVED',
      });
    }
    const note = String(req.body?.note || '').trim();
    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: row.id },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        note: note || row.note || null,
      },
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

    return res.json({
      ok: true,
      affiliation: {
        id: updated.id,
        status: updated.status,
        activatedAt: updated.activatedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = {
  publicRouter,
  adminRouter,
};
