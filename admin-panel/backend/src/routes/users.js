'use strict';
const router = require('express').Router();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { auditActor, auditContextMetadata } = require('../lib/auditActor');
const { sendExpoPushToMany } = require('../services/expoPush');
const { syncComprefaceGalleryAfterUserChange } = require('../lib/comprefaceGallerySyncTrigger');
const { isRegistrationPrimaryFacePhoto } = require('../lib/faceEnrollmentPrimary');
const {
  MAX_FACE_ENROLLMENT_PHOTOS,
  MAX_FACE_ENROLLMENT_BYTES,
  normalizeFacePhotos,
  sortFaceEnrollmentPrimaryFirst,
  mimeToFaceExt,
  detectFaceExtFromBuffer,
  appendUserFaceEnrollmentPhoto,
  removeUserFaceEnrollmentPhoto,
} = require('../lib/faceEnrollmentPersist');
const { assertTechnicianSeatForNewUser, assertTechnicianSeatForUserPatch } = require('../lib/planQuotaService');
const { sendTransactionalEmailWithFallback } = require('../lib/transactionalEmailSend');
const {
  assertTenantAccess,
  hasCapability,
  isPlatformAdmin,
  normalizeRole,
  nonPlatformUserReadWhere,
  resolveScopedTenantId,
} = require('../lib/authorization');
const { normalizeServiceCoverageGeo } = require('../lib/technicianServiceCoverage');
const { validateAppPasswordPolicy } = require('../lib/appPasswordPolicy');
const { validatePanelRoleForTenantKind, setUnifiedPasswordHashForEmail } = require('../lib/appAccountAuth');
const { ensureHttpsUrlForPublicInternet } = require('../lib/publicHttpsUrl');
const {
  syncActiveAffiliationFromTechnicianStatus,
  downsyncAffiliationsForSingleUserTechnician,
} = require('../lib/providerTechnicianAffiliationSync');
const { invalidateAppEffectiveTenantIdCache } = require('../lib/appLoginEffectiveTenant');
const { resolveMergedProviderIdentityForUserId, normalizeEmail: normalizeEmailForPi } = require('../lib/providerIdentityMerge');
const { trustedAutoVerifyProviderKycInTx } = require('../lib/providerTrustedKycAutoVerify');
const { isProviderFirstNetworkEnabled } = require('../lib/providerFirstNetwork');
const {
  validateDedicatedExclusivePayload,
  buildTenantScheduleJsonDedicatedExclusive,
} = require('../lib/dedicatedExclusiveTime');
const {
  assertNoDedicatedOverlapForProviderIdentity,
  dedicatedAffiliationBlocksPartnershipInvite,
} = require('../lib/providerDedicatedExclusiveService');
const {
  allocateUniqueUserRowEmail,
  resolveActiveUserIdsForDispatchOwnerEmail,
  resolveCanonicalEmailNormForUser,
} = require('../lib/userEmailUnique');

const MAX_AVATAR_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_DOC_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const USER_ROLES = new Set(['USER', 'PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN']);

function escapeHtmlEmail(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function newEmailVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** URL do painel para `verify-email.html?token=` — defina ADMIN_PANEL_PUBLIC_BASE_URL (ou PUBLIC_PANEL_URL). */
function buildPublicVerifyEmailLink(token) {
  const base = String(
    process.env.PUBLIC_PANEL_URL ||
      process.env.ADMIN_PANEL_PUBLIC_URL ||
      process.env.ADMIN_PANEL_PUBLIC_BASE_URL ||
      '',
  )
    .trim()
    .replace(/\/+$/, '');
  if (!base) return null;
  const root = ensureHttpsUrlForPublicInternet(base);
  return `${root}/verify-email.html?token=${encodeURIComponent(token)}`;
}

/** Matrícula funcional (ponto / RH). Vazio → null. Máx. 80 caracteres. */
function normalizeEmployeeMatricula(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, 80);
}

function mimeToDocAttachmentExt(mt) {
  const m = String(mt || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return null;
}

/** PDF / JPEG / PNG / WebP para anexos de documentos (admin). */
function detectDocAttachmentExtFromBuffer(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  const head = buf.slice(0, 12);
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

const userListSelect = {
  id: true,
  tenantId: true,
  appAccountId: true,
  email: true,
  name: true,
  employeeMatricula: true,
  avatarUrl: true,
  phone: true,
  role: true,
  isActive: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
  comprefaceRecognitionSync: true,
  tenant: { select: { id: true, name: true, email: true, kind: true } },
  technicianProfile: { select: { id: true, status: true } },
  workTimeTrackingEnabled: true,
  addressJson: true,
  emailVerifiedAt: true,
  emailVerificationExpiresAt: true,
  appAccount: { select: { emailNorm: true } },
};

const TECHNICIAN_STATUSES = new Set(['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED']);
const USER_LIST_SORT_FIELDS = new Set([
  'id',
  'createdAt',
  'lastLogin',
  'name',
  'email',
  'updatedAt',
  'employeeMatricula',
  'role',
  'isActive',
  'workTimeTrackingEnabled',
  'emailVerifiedAt',
]);

function scopedTenantIdFromReq(req, requestedTenantId = null) {
  return resolveScopedTenantId(req.authorization, requestedTenantId);
}

async function findScopedUserOrNull(req, userId, extra = {}) {
  const id = String(userId || '').trim();
  const base = await prisma.user.findUnique({
    where: { id },
    select: { id: true, tenantId: true, role: true },
  });
  if (!base) return null;
  if (!assertTenantAccess(req.authorization, base.tenantId)) return null;
  if (!isPlatformAdmin(req.authorization) && normalizeRole(base.role) === 'SAAS_ADMIN') return null;
  if (!extra || Object.keys(extra).length === 0) return base;
  return prisma.user.findUnique({
    where: { id },
    ...extra,
  });
}

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const {
      tenantId,
      role,
      q,
      page = 1,
      limit = 50,
      workTime,
      active,
      technicianStatus,
      comprefaceStatus,
      emailVerification,
      lastLoginFrom,
      lastLoginTo,
      sort,
      sortDir,
    } = req.query;

    const scopedTenantId = scopedTenantIdFromReq(req, tenantId);
    const where = {
      ...(scopedTenantId && { tenantId: String(scopedTenantId) }),
      ...(role && { role }),
      ...(workTime === '1' && { workTimeTrackingEnabled: true }),
      ...(active === '1' || active === 'true' ? { isActive: true } : {}),
      ...(active === '0' || active === 'false' ? { isActive: false } : {}),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { employeeMatricula: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const ts = technicianStatus && String(technicianStatus).trim().toUpperCase();
    if (ts && TECHNICIAN_STATUSES.has(ts)) {
      where.technicianProfile = { is: { status: ts } };
    }

    const cfs = comprefaceStatus && String(comprefaceStatus).trim().toLowerCase();
    const andExtra = [];
    if (cfs === 'synced' || cfs === 'pending' || cfs === 'error') {
      andExtra.push({
        comprefaceRecognitionSync: {
          path: ['status'],
          equals: cfs,
        },
      });
    } else if (cfs === 'none') {
      andExtra.push({ comprefaceRecognitionSync: null });
    }

    const evf = emailVerification && String(emailVerification).trim().toLowerCase();
    if (evf === 'verified') {
      andExtra.push({ emailVerifiedAt: { not: null } });
    } else if (evf === 'unverified') {
      andExtra.push({ emailVerifiedAt: null });
    } else if (evf === 'pending') {
      andExtra.push({
        emailVerifiedAt: null,
        emailVerificationToken: { not: null },
        emailVerificationExpiresAt: { gt: new Date() },
      });
    }

    const llFrom = lastLoginFrom ? new Date(String(lastLoginFrom)) : null;
    const llTo = lastLoginTo ? new Date(String(lastLoginTo)) : null;
    const loginRange = {};
    if (llFrom && !Number.isNaN(llFrom.getTime())) loginRange.gte = llFrom;
    if (llTo && !Number.isNaN(llTo.getTime())) {
      const end = new Date(llTo);
      end.setHours(23, 59, 59, 999);
      loginRange.lte = end;
    }
    if (Object.keys(loginRange).length) where.lastLogin = loginRange;

    if (andExtra.length) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...andExtra];
    }
    if (!isPlatformAdmin(req.authorization)) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), nonPlatformUserReadWhere(req.authorization)];
    }

    const sortKey = USER_LIST_SORT_FIELDS.has(String(sort || '')) ? String(sort) : 'createdAt';
    const dir = String(sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortKey]: dir };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: +limit,
        orderBy,
        select: userListSelect,
      }),
      prisma.user.count({ where }),
    ]);
    const data = await Promise.all(
      users.map(async (u) => ({
        ...u,
        loginEmailNorm: await resolveCanonicalEmailNormForUser(prisma, u),
      })),
    );
    res.json({ data, total, page: +page, sort: sortKey, sortDir: dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/partnership-candidates?tenantId= — prestadores com identidade global sem dedicado bloqueante
router.get('/partnership-candidates', async (req, res) => {
  try {
    const rawTid = req.query.tenantId != null ? String(req.query.tenantId).trim() : '';
    const invitingTenantId = scopedTenantIdFromReq(req, rawTid || null);
    if (!invitingTenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório (organização que envia o convite).' });
    }
    if (!assertTenantAccess(req.authorization, invitingTenantId)) {
      return res.status(403).json({ error: 'Sem permissão para listar candidatos neste tenant.' });
    }
    const invitingTenant = await prisma.tenant.findUnique({
      where: { id: invitingTenantId },
      select: { id: true, kind: true },
    });
    if (!invitingTenant || String(invitingTenant.kind || '').toUpperCase() !== 'COMPANY') {
      return res.status(400).json({ error: 'Apenas tenants empresa (COMPANY) podem convidar parcerias pelo painel.' });
    }

    const identities = await prisma.providerIdentity.findMany({
      where: {
        user: {
          isActive: true,
          role: 'PROVIDER',
        },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            appAccountId: true,
            appAccount: { select: { emailNorm: true } },
            technicianProfile: { select: { city: true } },
          },
        },
        affiliations: {
          where: { relationshipType: 'DEDICATED' },
          select: { tenantId: true, status: true, relationshipType: true },
        },
      },
      orderBy: [{ user: { name: 'asc' } }],
      take: 2000,
    });

    const data = [];
    for (const pi of identities) {
      const list = Array.isArray(pi.affiliations) ? pi.affiliations : [];
      const blocked = list.some((a) => dedicatedAffiliationBlocksPartnershipInvite(a, invitingTenantId));
      if (blocked) continue;
      const u = pi.user;
      const emailOut =
        (await resolveCanonicalEmailNormForUser(prisma, u)) || String(u?.email || '').trim().toLowerCase();
      if (!emailOut) continue;
      data.push({
        providerIdentityId: pi.id,
        userId: u.id,
        email: emailOut,
        name: u.name,
        city: u.technicianProfile?.city || null,
      });
    }

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users — `tenantId` (um) ou `tenantIds` (vários); cria um registo User por tenant com o mesmo e-mail e senha.
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      tenantId,
      tenantIds: bodyTenantIds,
      role: bodyRole = 'USER',
      employeeMatricula: rawMatricula,
    } = req.body;

    const fromArray =
      Array.isArray(bodyTenantIds) && bodyTenantIds.length
        ? bodyTenantIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
    const fromSingle = tenantId ? [String(tenantId).trim()] : [];
    const requestedTenantIds = [...new Set([...fromArray, ...fromSingle])].filter(Boolean);

    if (!name || !email || !password || !requestedTenantIds.length) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    for (const tid of requestedTenantIds) {
      if (!assertTenantAccess(req.authorization, tid)) {
        return res.status(403).json({ error: 'Sem permissão para criar utilizador num dos tenants selecionados.' });
      }
    }

    const pwCreate = validateAppPasswordPolicy(password);
    if (!pwCreate.ok) return res.status(400).json({ error: pwCreate.error });
    const role = String(bodyRole).toUpperCase();
    if (!USER_ROLES.has(role)) return res.status(400).json({ error: 'Papel inválido.' });
    if (!isPlatformAdmin(req.authorization) && role === 'SAAS_ADMIN') {
      return res.status(403).json({ error: 'Apenas a plataforma pode criar contas SaaS.' });
    }
    const employeeMatricula = normalizeEmployeeMatricula(rawMatricula);
    const emailNorm = String(email).trim().toLowerCase();

    const tenantIdsResolved = [
      ...new Set(
        requestedTenantIds.map((tid) => {
          const scoped = scopedTenantIdFromReq(req, tid);
          return scoped ? String(scoped) : null;
        }),
      ),
    ].filter(Boolean);

    if (!tenantIdsResolved.length) {
      return res.status(400).json({ error: 'Tenant inválido na lista.' });
    }
    const tenantsFound = await prisma.tenant.findMany({
      where: { id: { in: tenantIdsResolved } },
      select: { id: true, kind: true },
    });
    if (tenantsFound.length !== tenantIdsResolved.length) {
      return res.status(400).json({ error: 'Um ou mais tenants não existem.' });
    }
    const tenantKindById = new Map(tenantsFound.map((t) => [t.id, String(t.kind || '').toUpperCase()]));

    const nonCompanyIds = tenantIdsResolved.filter((tid) => {
      const k = tenantKindById.get(tid) || '';
      return k !== 'COMPANY';
    });
    if (nonCompanyIds.length) {
      return res.status(400).json({
        error:
          'Apenas tenants do tipo empresa (COMPANY) podem receber utilizadores criados por esta rota. Contas imobiliária (CLIENT) ou prestador (PROVIDER) usam outros fluxos.',
      });
    }

    const existingAccForEmail = await prisma.appAccount.findUnique({
      where: { emailNorm },
      select: { id: true },
    });
    for (const scopedTenantId of tenantIdsResolved) {
      if (employeeMatricula) {
        const dup = await prisma.user.findFirst({ where: { tenantId: scopedTenantId, employeeMatricula } });
        if (dup) {
          return res.status(400).json({
            error: 'Matrícula já em uso nesta organização.',
            tenantId: scopedTenantId,
          });
        }
      }
      const dupEmail = await prisma.user.findFirst({
        where: {
          tenantId: scopedTenantId,
          OR: [
            { email: { equals: emailNorm, mode: 'insensitive' } },
            ...(existingAccForEmail?.id ? [{ appAccountId: existingAccForEmail.id }] : []),
          ],
        },
      });
      if (dupEmail) {
        return res.status(400).json({
          error: 'E-mail já em uso neste tenant.',
          tenantId: scopedTenantId,
        });
      }
      const kSeat = tenantKindById.get(scopedTenantId) || '';
      let roleForSeat = role;
      if (kSeat === 'CLIENT') roleForSeat = 'USER';
      if (kSeat === 'PROVIDER') roleForSeat = 'PROVIDER';
      const seat = await assertTechnicianSeatForNewUser(prisma, scopedTenantId, roleForSeat);
      if (!seat.ok) {
        return res.status(403).json({
          error: seat.error,
          code: seat.code || 'PLAN_MAX_TECHNICIANS',
          tenantId: scopedTenantId,
        });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const createdRows = await prisma.$transaction(async (tx) => {
      const acc = await tx.appAccount.upsert({
        where: { emailNorm },
        create: { emailNorm, password: hash },
        update: { password: hash },
      });
      await tx.user.updateMany({
        where: { email: emailNorm },
        data: { appAccountId: acc.id, password: hash },
      });
      const out = [];
      for (const scopedTenantId of tenantIdsResolved) {
        const tenantRow = await tx.tenant.findUnique({
          where: { id: scopedTenantId },
          select: { kind: true },
        });
        let roleForRow = String(role).toUpperCase();
        const k = String(tenantRow?.kind || '').toUpperCase();
        if (k === 'CLIENT') roleForRow = 'USER';
        if (k === 'PROVIDER') roleForRow = 'PROVIDER';

        const rowEmail = await allocateUniqueUserRowEmail(tx, {
          appAccountId: acc.id,
          loginEmailNorm: emailNorm,
        });
        const u = await tx.user.create({
          data: {
            name: String(name).trim(),
            email: rowEmail,
            password: hash,
            tenantId: scopedTenantId,
            role: roleForRow,
            employeeMatricula,
            appAccountId: acc.id,
          },
        });
        if (roleForRow === 'PROVIDER') {
          await tx.technicianProfile.create({
            data: { userId: u.id, status: 'PENDING', score: 5 },
          });
        }
        out.push(u);
      }
      return out;
    });

    const _a = auditActor(req);
    for (const row of createdRows) {
      await prisma.auditLog
        .create({
          data: {
            ..._a,
            tenantId: row.tenantId,
            action: 'USER_CREATE',
            resource: row.email,
            category: 'ADMIN',
            metadata: auditContextMetadata(req, { targetTenantId: row.tenantId, targetUserId: row.id }),
          },
        })
        .catch(() => {});
    }

    const first = createdRows[0];
    if (createdRows.length === 1) {
      res.status(201).json({
        id: first.id,
        name: first.name,
        email: first.email,
        role: first.role,
        employeeMatricula: first.employeeMatricula,
        tenantId: first.tenantId,
      });
    } else {
      res.status(201).json({
        count: createdRows.length,
        created: createdRows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          employeeMatricula: u.employeeMatricula,
          tenantId: u.tenantId,
        })),
      });
    }
  } catch (err) {
    if (err.code === 'P2002') {
      const fields = Array.isArray(err.meta?.target) ? err.meta.target.map(String) : [];
      if (fields.some((f) => f.includes('employee_matricula'))) {
        return res.status(400).json({ error: 'Matrícula já em uso nesta organização.' });
      }
      return res.status(400).json({ error: 'Registo duplicado (e-mail ou outro campo único).' });
    }
    res.status(500).json({ error: err.message });
  }
});

const MAX_BULK_USER_IDS = 200;

// PATCH /api/users/bulk-active — { ids: string[], isActive: boolean }
router.patch('/bulk-active', async (req, res) => {
  try {
    const { ids, isActive } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Envie ids: array de identificadores.' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive deve ser true ou false.' });
    }
    const clean = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, MAX_BULK_USER_IDS);
    if (!clean.length) {
      return res.status(400).json({ error: 'Nenhum id válido.' });
    }
    const scopedRows = await prisma.user.findMany({
      where: {
        id: { in: clean },
        ...(isPlatformAdmin(req.authorization)
          ? {}
          : {
              tenantId: scopedTenantIdFromReq(req),
              NOT: { role: 'SAAS_ADMIN' },
            }),
      },
      select: { id: true },
    });
    const allowedIds = scopedRows.map((row) => row.id);
    const result = await prisma.user.updateMany({
      where: { id: { in: allowedIds } },
      data: { isActive },
    });
    const _a = auditActor(req);
    await prisma.auditLog
      .create({
        data: {
          ..._a,
          action: isActive ? 'USER_BULK_ACTIVATE' : 'USER_BULK_DEACTIVATE',
          resource: `${result.count} usuários`,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            count: result.count,
            requested: clean.length,
            allowed: allowedIds.length,
            isActive,
            targetTenantId: scopedTenantIdFromReq(req),
          }),
        },
      })
      .catch(() => {});
    res.json({ updated: result.count, requested: clean.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/reset-password-by-email — { email, tenantId?, newPassword }
router.patch('/reset-password-by-email', async (req, res) => {
  try {
    const { email, tenantId, newPassword } = req.body || {};
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'E-mail e nova senha são obrigatórios.' });
    }
    const pwByEmail = validateAppPasswordPolicy(newPassword);
    if (!pwByEmail.ok) {
      return res.status(400).json({ error: pwByEmail.error });
    }
    const em = String(email).toLowerCase().trim();
    const tid = scopedTenantIdFromReq(req, tenantId);
    const candidateIds = await resolveActiveUserIdsForDispatchOwnerEmail(prisma, em, { tenantId: tid });
    const matches = candidateIds.length ? await prisma.user.findMany({
      where: {
        id: { in: candidateIds },
        ...(isPlatformAdmin(req.authorization) ? {} : { NOT: { role: 'SAAS_ADMIN' } }),
      },
      orderBy: { updatedAt: 'desc' },
      take: 12,
      select: { id: true },
    }) : [];
    if (matches.length === 0) {
      return res.status(404).json({ error: 'Nenhum utilizador encontrado com este e-mail.' });
    }
    const user = await findScopedUserOrNull(req, matches[0].id);
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    const hash = await bcrypt.hash(newPassword, 10);
    await setUnifiedPasswordHashForEmail(prisma, em, hash);
    await prisma.user.updateMany({
      where: { id: { in: candidateIds } },
      data: { currentSessionId: null, currentDeviceId: null },
    });
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    const _a = auditActor(req);
    await prisma.auditLog.create({
      data: {
        ..._a,
        tenantId: updated.tenantId,
        action: 'USER_RESET_PASSWORD',
        resource: updated.email,
        category: 'ADMIN',
        metadata: auditContextMetadata(req, {
          byEmail: true,
          targetTenantId: updated.tenantId,
          targetUserId: updated.id,
        }),
      },
    });
    res.json({ ok: true, userId: updated.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/reset-password
router.patch('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'Nova senha ausente.' });
    const pwId = validateAppPasswordPolicy(newPassword);
    if (!pwId.ok) return res.status(400).json({ error: pwId.error });
    const existing = await findScopedUserOrNull(req, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const hash = await bcrypt.hash(newPassword, 10);
    const em = await resolveCanonicalEmailNormForUser(prisma, existing);
    await setUnifiedPasswordHashForEmail(prisma, em, hash);
    const resetUserIds = await resolveActiveUserIdsForDispatchOwnerEmail(prisma, em);
    await prisma.user.updateMany({
      where: { id: { in: resetUserIds.length ? resetUserIds : [existing.id] } },
      data: { currentSessionId: null, currentDeviceId: null },
    });
    const user = await prisma.user.findUnique({ where: { id: existing.id } });
    const _a2 = auditActor(req);
    await prisma.auditLog.create({
      data: {
        ..._a2,
        tenantId: user.tenantId,
        action: 'USER_RESET_PASSWORD',
        resource: user.email,
        category: 'ADMIN',
        metadata: auditContextMetadata(req, { targetTenantId: user.tenantId, targetUserId: user.id }),
      },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/technician-profile — { status }
router.patch('/:id/technician-profile', async (req, res) => {
  try {
    const allowed = new Set(['ACTIVE', 'PENDING', 'INACTIVE', 'SUSPENDED']);
    const st = String(req.body.status || '').toUpperCase();
    if (!allowed.has(st)) return res.status(400).json({ error: 'status inválido.' });

    const user = await findScopedUserOrNull(req, req.params.id, {
      include: { technicianProfile: true },
    });
    if (!user || !user.technicianProfile) {
      return res.status(404).json({ error: 'Este usuário não tem perfil de prestador.' });
    }

    const updated = await prisma.technicianProfile.update({
      where: { id: user.technicianProfile.id },
      data: { status: st },
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'TECHNICIAN_PROFILE_STATUS',
          resource: user.email,
          category: 'ADMIN',
          metadata: { userId: user.id, status: st },
        },
      })
      .catch(() => {});

    if (st === 'ACTIVE') {
      try {
        const tu = await prisma.user.findUnique({
          where: { id: user.id },
          select: { tenantId: true, tenant: { select: { kind: true } } },
        });
        if (tu) {
          await syncActiveAffiliationFromTechnicianStatus(prisma, {
            userId: user.id,
            tenantId: tu.tenantId,
            tenantKind: tu.tenant?.kind,
          });
        }
      } catch (e) {
        console.error('[PATCH /users/:id/technician-profile] sync affiliation:', e?.message || e);
      }
    } else {
      try {
        await downsyncAffiliationsForSingleUserTechnician(prisma, user.id, st);
        invalidateAppEffectiveTenantIdCache(user.id);
      } catch (e) {
        console.error('[PATCH /users/:id/technician-profile] downsync affiliation:', e?.message || e);
      }
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/toggle-active
router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const current = await findScopedUserOrNull(req, req.params.id);
    if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const user = await prisma.user.update({ where: { id: current.id }, data: { isActive: !current.isActive } });
    res.json({ id: user.id, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/disconnect
router.post('/:id/disconnect', async (req, res) => {
  try {
    const user = await findScopedUserOrNull(req, req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { currentSessionId: null, currentDeviceId: null },
    });

    const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
    if (tokens.length > 0) {
      sendExpoPushToMany(tokens, {
        data: { type: 'FORCE_LOGOUT', reason: 'ADMIN_FORCE' },
      }).catch((err) => console.error('[admin_disconnect_push]', err));
    }

    res.json({ ok: true, message: 'Sessão encerrada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/face-reenrollment-window — abre ou encerra janela para o prestador atualizar fotos na app
router.post('/:id/face-reenrollment-window', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await findScopedUserOrNull(req, id, {
      include: { technicianProfile: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!user.technicianProfile) {
      return res.status(400).json({ error: 'Este utilizador não tem perfil técnico.' });
    }
    if (String(user.technicianProfile.status || '').toUpperCase() !== 'ACTIVE') {
      return res.status(400).json({
        error: 'A janela de rematrícula facial aplica-se apenas a prestadores com estado ACTIVE.',
      });
    }
    const clear = !!req.body?.clear;
    if (clear) {
      await prisma.technicianProfile.update({
        where: { userId: id },
        data: { faceReenrollmentUntil: null, faceReenrollmentNote: null },
      });
      await prisma.auditLog
        .create({
          data: {
            ...auditActor(req),
            tenantId: user.tenantId,
            action: 'USER_FACE_REENROLLMENT_WINDOW_CLEARED',
            resource: user.email,
            category: 'ADMIN',
            metadata: { userId: id },
          },
        })
        .catch(() => {});
      return res.json({ ok: true, cleared: true });
    }
    let until;
    const untilRaw = req.body?.until;
    if (untilRaw != null && String(untilRaw).trim()) {
      until = new Date(String(untilRaw).trim());
      if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'Data «until» inválida ou já passou.' });
      }
    } else {
      const hours = Math.min(336, Math.max(1, parseInt(String(req.body?.hours ?? 72), 10) || 72));
      until = new Date(Date.now() + hours * 3600 * 1000);
    }
    const note =
      req.body?.note != null && String(req.body.note).trim()
        ? String(req.body.note).trim().slice(0, 2000)
        : null;
    await prisma.technicianProfile.update({
      where: { userId: id },
      data: { faceReenrollmentUntil: until, faceReenrollmentNote: note },
    });
    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'USER_FACE_REENROLLMENT_WINDOW_OPENED',
          resource: user.email,
          category: 'ADMIN',
          metadata: { userId: id, until: until.toISOString(), hasNote: !!note },
        },
      })
      .catch(() => {});
    res.json({
      ok: true,
      faceReenrollmentUntil: until.toISOString(),
      faceReenrollmentNote: note,
    });
  } catch (err) {
    console.error('POST /users/:id/face-reenrollment-window', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/face-enrollment — foto base para reconhecimento facial (JPEG/PNG/WebP, máx. 5 MB)
router.post('/:id/face-enrollment', async (req, res) => {
  try {
    const { id } = req.params;
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'fileBase64 é obrigatório.' });
    }

    const user = await findScopedUserOrNull(req, id, {
      select: { id: true, tenantId: true, email: true, role: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const out = await appendUserFaceEnrollmentPhoto(prisma, {
      userId: id,
      tenantId: user.tenantId,
      resourceEmail: user.email,
      fileBase64,
      mimeType,
      req,
      auditAction: 'USER_FACE_ENROLLMENT_ADD',
      auditCategory: 'ADMIN',
      syncReason: 'face_enrollment_add',
    });
    if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
    res.status(201).json({
      photo: out.photo,
      photos: out.photos,
      comprefaceSync: out.comprefaceSync,
      comprefaceRecognitionSync: out.comprefaceRecognitionSync,
    });
  } catch (err) {
    console.error('POST /users/:id/face-enrollment', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/document-attachment — PDF ou imagem (JPEG/PNG/WebP) para URL em documentos do utilizador
router.post('/:id/document-attachment', async (req, res) => {
  try {
    const { id } = req.params;
    const { fileBase64, mimeType, fileName } = req.body || {};
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'fileBase64 é obrigatório.' });
    }
    const b64 = String(fileBase64).replace(/\s/g, '');
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Base64 inválido.' });
    }
    if (buf.length > MAX_DOC_ATTACHMENT_BYTES) {
      return res.status(400).json({ error: 'Ficheiro demasiado grande (máx. 15 MB).' });
    }
    if (buf.length < 16) return res.status(400).json({ error: 'Ficheiro inválido.' });

    let ext = mimeToDocAttachmentExt(mimeType);
    if (!ext) ext = detectDocAttachmentExtFromBuffer(buf);
    if (!ext) {
      const n = String(fileName || '').toLowerCase();
      if (n.endsWith('.pdf')) ext = 'pdf';
      else if (n.endsWith('.jpg') || n.endsWith('.jpeg')) ext = 'jpg';
      else if (n.endsWith('.png')) ext = 'png';
      else if (n.endsWith('.webp')) ext = 'webp';
    }
    if (!ext) return res.status(400).json({ error: 'Use PDF, JPEG, PNG ou WebP.' });

    const user = await findScopedUserOrNull(req, id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const attId = `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const fname = `${attId}.${ext}`;
    const absDir = path.join(__dirname, '../../public/uploads/user-documents', id);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(path.join(absDir, fname), buf);

    const publicPath = `/uploads/user-documents/${id}/${fname}`;

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'USER_DOCUMENT_ATTACHMENT_UPLOAD',
          resource: user.email,
          category: 'ADMIN',
          metadata: { userId: id, path: publicPath, bytes: buf.length },
        },
      })
      .catch(() => {});

    res.status(201).json({ url: publicPath, bytes: buf.length });
  } catch (err) {
    console.error('POST /users/:id/document-attachment', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/avatar-attachment — JPEG/PNG/WebP até 5 MB; URL pública para o campo avatarUrl
router.post('/:id/avatar-attachment', async (req, res) => {
  try {
    const { id } = req.params;
    const { fileBase64, mimeType, fileName } = req.body || {};
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'fileBase64 é obrigatório.' });
    }
    const b64 = String(fileBase64).replace(/\s/g, '');
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Base64 inválido.' });
    }
    if (buf.length > MAX_AVATAR_ATTACHMENT_BYTES) {
      return res.status(400).json({ error: 'O arquivo é grande demais (máx. 5 MB).' });
    }
    if (buf.length < 16) return res.status(400).json({ error: 'Arquivo inválido.' });

    let ext = mimeToFaceExt(mimeType);
    if (!ext) ext = detectFaceExtFromBuffer(buf);
    if (!ext) {
      const n = String(fileName || '').toLowerCase();
      if (n.endsWith('.jpg') || n.endsWith('.jpeg')) ext = 'jpg';
      else if (n.endsWith('.png')) ext = 'png';
      else if (n.endsWith('.webp')) ext = 'webp';
    }
    if (ext === 'heic') {
      return res.status(400).json({ error: 'HEIC não é aceito. Converta para JPEG ou PNG.' });
    }
    if (!ext) return res.status(400).json({ error: 'Use JPEG, PNG ou WebP.' });

    const user = await findScopedUserOrNull(req, id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const attId = `av_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const fname = `${attId}.${ext}`;
    const absDir = path.join(__dirname, '../../public/uploads/user-avatars', id);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(path.join(absDir, fname), buf);

    const publicPath = `/uploads/user-avatars/${id}/${fname}`;

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'USER_AVATAR_ATTACHMENT_UPLOAD',
          resource: user.email,
          category: 'ADMIN',
          metadata: { userId: id, path: publicPath, bytes: buf.length },
        },
      })
      .catch(() => {});

    res.status(201).json({ url: publicPath, bytes: buf.length });
  } catch (err) {
    console.error('POST /users/:id/avatar-attachment', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/send-email-verification — gera token (48 h), envia e-mail (MailerSend se configurado; senão Nylas)
router.post('/:id/send-email-verification', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await findScopedUserOrNull(req, id);
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (existing.emailVerifiedAt) {
      return res.status(400).json({ error: 'Este e-mail já está verificado.' });
    }

    let token = newEmailVerificationToken();
    const exp = new Date(Date.now() + 48 * 3600 * 1000);
    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      try {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            emailVerificationToken: token,
            emailVerificationExpiresAt: exp,
          },
        });
        saved = true;
      } catch (e) {
        if (e && e.code === 'P2002') token = newEmailVerificationToken();
        else throw e;
      }
    }
    if (!saved) return res.status(500).json({ error: 'Não foi possível gerar o token de verificação.' });

    const link = buildPublicVerifyEmailLink(token);
    const subject = 'Confirme o seu e-mail — BrSpark';
    const text = link
      ? `Olá,\n\nClique no link abaixo para confirmar o seu e-mail. O link fica válido por 48 horas.\n\n${link}\n\nSe não foi você que pediu isso, ignore esta mensagem.\n`
      : `Olá,\n\nNo painel BrSpark, use o fluxo de verificação com o token abaixo (válido por 48 horas).\n\n${token}\n\nSe não foi você que pediu isso, ignore esta mensagem.\n`;
    const html = link
      ? `<p>Olá,</p><p><strong>Confirme o seu e-mail</strong> clicando no link abaixo. O link fica válido por <strong>48 horas</strong>.</p><p><a href="${escapeHtmlEmail(link)}">Confirmar o e-mail</a></p><p>Se não foi você que pediu isso, ignore esta mensagem.</p>`
      : `<p>Olá,</p><p>No painel BrSpark, <strong>confirme o seu e-mail</strong> com o token abaixo (válido por <strong>48 horas</strong>).</p><p style="font-family:monospace;word-break:break-all">${escapeHtmlEmail(token)}</p><p>Se não foi você que pediu isso, ignore esta mensagem.</p>`;

    const { send, provider } = await sendTransactionalEmailWithFallback({
      to: existing.email,
      subject,
      html,
      text,
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: existing.tenantId,
          action: 'USER_EMAIL_VERIFICATION_SENT',
          resource: existing.email,
          category: 'ADMIN',
          metadata: {
            userId: id,
            emailSent: !!send.ok,
            skipped: !!send.skipped,
            emailProvider: provider,
          },
        },
      })
      .catch(() => {});

    res.status(201).json({
      ok: true,
      email: send.ok
        ? { sent: true, provider }
        : {
            sent: false,
            skipped: !!send.skipped,
            provider,
            error: send.error || send.reason || 'Falha no envio.',
          },
      verificationUrl: link || null,
      expiresInHours: 48,
    });
  } catch (err) {
    console.error('POST /users/:id/send-email-verification', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/sync-compreface — envia avatar + matrícula ao FaceMatch (galeria Recognition)
router.post('/:id/sync-compreface', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await findScopedUserOrNull(req, id);
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const { comprefaceRecognitionSync: syncPayload, syncResult } = await syncComprefaceGalleryAfterUserChange(
      prisma,
      existing.id,
      req,
      'manual_api',
    );
    const result = syncResult || { ok: false, error: 'Falha na sincronização.' };

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error || 'Falha na sincronização.',
        comprefaceRecognitionSync: syncPayload,
      });
    }
    res.json({
      ok: true,
      subject: result.subject,
      faces: result.faces,
      root: result.root,
      ...(result.orphanSubjectsCleaned != null && result.orphanSubjectsCleaned > 0
        ? { orphanSubjectsCleaned: result.orphanSubjectsCleaned }
        : {}),
      comprefaceRecognitionSync: syncPayload,
    });
  } catch (err) {
    console.error('POST /users/:id/sync-compreface', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/users/:id/face-enrollment/:photoId
router.delete('/:id/face-enrollment/:photoId', async (req, res) => {
  try {
    const { id, photoId } = req.params;
    const user = await findScopedUserOrNull(req, id, {
      select: { id: true, tenantId: true, email: true, role: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const out = await removeUserFaceEnrollmentPhoto(prisma, {
      userId: id,
      tenantId: user.tenantId,
      resourceEmail: user.email,
      photoId,
      req,
      auditAction: 'USER_FACE_ENROLLMENT_REMOVE',
      auditCategory: 'ADMIN',
      syncReason: 'face_enrollment_delete',
    });
    if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
    res.json({
      photos: out.photos,
      comprefaceSync: out.comprefaceSync,
      comprefaceRecognitionSync: out.comprefaceRecognitionSync,
    });
  } catch (err) {
    console.error('DELETE /users/:id/face-enrollment/:photoId', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/provider-affiliations — vínculos prestador ↔ tenants empresa (painel)
router.get('/:id/provider-affiliations', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const user = await findScopedUserOrNull(req, id, { select: { id: true, email: true, role: true } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const emailNorm = normalizeEmailForPi(user.email || '');
    const providerIdentityFull = await resolveMergedProviderIdentityForUserId(prisma, id, emailNorm);
    if (!providerIdentityFull) {
      return res.json({ providerIdentity: null, onboardingApplication: null, affiliations: [] });
    }

    const providerIdentity = {
      id: providerIdentityFull.id,
      globalStatus: providerIdentityFull.globalStatus,
      kycStatus: providerIdentityFull.kycStatus,
      updatedAt: providerIdentityFull.updatedAt,
      affiliations: providerIdentityFull.affiliations || [],
    };

    const rows = (providerIdentity.affiliations || []).filter((row) => {
      const kind = String(row.tenant?.kind || '').toUpperCase();
      if (kind === 'CLIENT' || kind === 'PROVIDER') return false;
      return assertTenantAccess(req.authorization, row.tenantId);
    });

    const tenantIdsForPf = [...new Set(rows.map((r) => String(r.tenantId || '').trim()).filter(Boolean))];
    const providerFirstByTenant = {};
    await Promise.all(
      tenantIdsForPf.map(async (tid) => {
        providerFirstByTenant[tid] = await isProviderFirstNetworkEnabled(tid);
      }),
    );

    const latestOnboarding = await prisma.providerOnboardingApplication.findFirst({
      where: { providerIdentityId: providerIdentityFull.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        revisionNote: true,
        updatedAt: true,
        resolvedAt: true,
      },
    });

    res.json({
      providerIdentity: {
        id: providerIdentity.id,
        globalStatus: providerIdentity.globalStatus,
        kycStatus: providerIdentity.kycStatus,
        updatedAt: providerIdentity.updatedAt,
      },
      onboardingApplication: latestOnboarding,
      affiliations: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenant: row.tenant,
        status: row.status,
        relationshipType: row.relationshipType || 'DEDICATED',
        note: row.note,
        invitedAt: row.invitedAt,
        requestedAt: row.requestedAt,
        activatedAt: row.activatedAt,
        endedAt: row.endedAt,
        tenantScheduleJson: row.tenantScheduleJson ?? null,
        providerIdentityKycStatus: row.providerIdentity?.kycStatus ?? null,
        providerFirstNetworkEnabled: !!providerFirstByTenant[String(row.tenantId || '').trim()],
      })),
    });
  } catch (err) {
    console.error('GET /users/:id/provider-affiliations', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/:id/provider-affiliations/:affiliationId/dedicated-exclusive
// Janelas de exclusividade (tempo) em vínculo DEDICATED+ACTIVE — acordadas com o prestador.
router.patch('/:id/provider-affiliations/:affiliationId/dedicated-exclusive', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const affiliationId = String(req.params.affiliationId || '').trim();
    const user = await findScopedUserOrNull(req, userId, { select: { id: true, email: true, role: true } });
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const val = validateDedicatedExclusivePayload(req.body);
    if (!val.ok) return res.status(400).json({ error: val.error });

    const aff = await prisma.providerTenantAffiliation.findFirst({
      where: { id: affiliationId, providerIdentity: { userId: user.id } },
      include: { providerIdentity: { select: { id: true } } },
    });
    if (!aff) return res.status(404).json({ error: 'Afiliação não encontrada para este utilizador.' });

    if (!assertTenantAccess(req.authorization, aff.tenantId)) {
      return res.status(403).json({ error: 'Sem permissão para esta organização.' });
    }
    const rel = String(aff.relationshipType || '').toUpperCase();
    if (rel !== 'DEDICATED') {
      return res.status(400).json({ error: 'Janelas dedicadas exclusivas só se aplicam a vínculos DEDICATED.' });
    }

    const nextJson = buildTenantScheduleJsonDedicatedExclusive(aff.tenantScheduleJson, val.timezone, val.weeklyWindows);
    const overlap = await assertNoDedicatedOverlapForProviderIdentity(
      prisma,
      aff.providerIdentityId,
      nextJson,
      affiliationId,
    );
    if (!overlap.ok) {
      return res.status(409).json({ error: overlap.error, code: 'DEDICATED_OVERLAP' });
    }

    const updated = await prisma.providerTenantAffiliation.update({
      where: { id: affiliationId },
      data: { tenantScheduleJson: nextJson },
      include: {
        tenant: { select: { id: true, name: true, slug: true, kind: true } },
      },
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: aff.tenantId,
          action: 'PROVIDER_AFFILIATION_DEDICATED_WINDOWS',
          resource: user.email,
          category: 'ADMIN',
          metadata: { userId: user.id, affiliationId },
        },
      })
      .catch(() => {});

    res.json({
      ok: true,
      affiliation: {
        id: updated.id,
        tenantId: updated.tenantId,
        tenant: updated.tenant,
        status: updated.status,
        relationshipType: updated.relationshipType,
        tenantScheduleJson: updated.tenantScheduleJson,
      },
    });
  } catch (err) {
    console.error('PATCH /users/:id/provider-affiliations/:affiliationId/dedicated-exclusive', err);
    res.status(500).json({ error: err.message });
  }
});

async function resolveSubmittedGlobalOnboardingForUser(req, userId) {
  const user = await findScopedUserOrNull(req, userId, {
    select: { id: true, email: true, tenantId: true, role: true },
  });
  if (!user) return { error: 'Usuário não encontrado.', status: 404 };
  const emailNorm = normalizeEmailForPi(user.email || '');
  const piFull = await resolveMergedProviderIdentityForUserId(prisma, user.id, emailNorm);
  if (!piFull) return { error: 'Sem identidade global de prestador.', status: 404, code: 'NO_PROVIDER_IDENTITY' };
  const app = await prisma.providerOnboardingApplication.findFirst({
    where: { providerIdentityId: piFull.id, status: 'SUBMITTED' },
    orderBy: { submittedAt: 'desc' },
  });
  if (!app) {
    return {
      error: 'Não há candidatura de onboarding global em estado SUBMETIDO para rever.',
      status: 409,
      code: 'NO_SUBMITTED_ONBOARDING',
    };
  }
  return { user, piFull, app };
}

// POST /api/users/:id/provider-onboarding/approve — aprova KYC global (candidatura SUBMITTED)
router.post('/:id/provider-onboarding/approve', express.json(), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const resolved = await resolveSubmittedGlobalOnboardingForUser(req, id);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        error: resolved.error,
        code: resolved.code,
      });
    }
    const { user, piFull, app } = resolved;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.providerOnboardingApplication.update({
        where: { id: app.id },
        data: { status: 'APPROVED', resolvedAt: now, revisionNote: null },
      });
      await trustedAutoVerifyProviderKycInTx(tx, {
        userId: user.id,
        providerIdentityId: piFull.id,
        responsesJson: app.responsesJson,
      });
    });

    try {
      const [tp, freshUser, tenantRow] = await Promise.all([
        prisma.technicianProfile.findUnique({
          where: { userId: user.id },
          select: { status: true },
        }),
        prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true } }),
        prisma.user.findUnique({
          where: { id: user.id },
          select: { tenantId: true, tenant: { select: { kind: true } } },
        }),
      ]);
      const techSt = String(tp?.status || '').toUpperCase();
      const userActive = freshUser?.isActive !== false;
      if (tp && techSt === 'ACTIVE' && userActive && tenantRow?.tenantId) {
        await syncActiveAffiliationFromTechnicianStatus(prisma, {
          userId: user.id,
          tenantId: tenantRow.tenantId,
          tenantKind: tenantRow.tenant?.kind,
        });
      }
      invalidateAppEffectiveTenantIdCache(user.id);
    } catch (e) {
      console.error('[POST /users/:id/provider-onboarding/approve] sync affiliation:', e?.message || e);
    }

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'PROVIDER_ONBOARDING_KYC_APPROVED',
          resource: user.email,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            targetUserId: user.id,
            providerIdentityId: piFull.id,
            applicationId: app.id,
          }),
        },
      })
      .catch(() => {});
    res.json({
      ok: true,
      kycStatus: 'APPROVED',
      globalStatus: 'VERIFIED',
      technicianStatus: 'ACTIVE',
    });
  } catch (err) {
    console.error('POST /users/:id/provider-onboarding/approve', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/provider-onboarding/request-revision — body: { note }
router.post('/:id/provider-onboarding/request-revision', express.json(), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const note = String(req.body?.note || '').trim();
    if (!note) return res.status(400).json({ error: 'Indique a nota para o prestador (motivo dos ajustes).' });
    if (note.length > 8000) return res.status(400).json({ error: 'Nota demasiado longa (máx. 8000 caracteres).' });
    const resolved = await resolveSubmittedGlobalOnboardingForUser(req, id);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        error: resolved.error,
        code: resolved.code,
      });
    }
    const { piFull, app, user } = resolved;
    await prisma.$transaction(async (tx) => {
      await tx.providerOnboardingApplication.update({
        where: { id: app.id },
        data: { status: 'NEEDS_REVISION', revisionNote: note },
      });
      await tx.providerIdentity.update({
        where: { id: piFull.id },
        data: {
          kycStatus: 'PENDING',
          globalStatus: 'PENDING',
          kycReviewedAt: new Date(),
          kycReviewNote: note.slice(0, 2000),
        },
      });
    });
    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'PROVIDER_ONBOARDING_NEEDS_REVISION',
          resource: user.email,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            targetUserId: user.id,
            providerIdentityId: piFull.id,
            applicationId: app.id,
          }),
        },
      })
      .catch(() => {});
    res.json({ ok: true, applicationStatus: 'NEEDS_REVISION' });
  } catch (err) {
    console.error('POST /users/:id/provider-onboarding/request-revision', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/provider-onboarding/reject — body opcional: { note }
router.post('/:id/provider-onboarding/reject', express.json(), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 2000);
    const resolved = await resolveSubmittedGlobalOnboardingForUser(req, id);
    if (resolved.error) {
      return res.status(resolved.status || 400).json({
        error: resolved.error,
        code: resolved.code,
      });
    }
    const { piFull, app, user } = resolved;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.providerOnboardingApplication.update({
        where: { id: app.id },
        data: {
          status: 'REJECTED',
          resolvedAt: now,
          revisionNote: note || null,
        },
      });
      await tx.providerIdentity.update({
        where: { id: piFull.id },
        data: {
          kycStatus: 'REJECTED',
          globalStatus: 'REJECTED',
          kycReviewedAt: now,
          kycReviewNote: note || null,
        },
      });
    });
    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'PROVIDER_ONBOARDING_REJECTED',
          resource: user.email,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            targetUserId: user.id,
            providerIdentityId: piFull.id,
            applicationId: app.id,
          }),
        },
      })
      .catch(() => {});
    res.json({ ok: true, kycStatus: 'REJECTED' });
  } catch (err) {
    console.error('POST /users/:id/provider-onboarding/reject', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id/admin-activity — últimos eventos de auditoria ligados a este usuário (painel)
router.get('/:id/admin-activity', async (req, res) => {
  try {
    const user = await findScopedUserOrNull(req, req.params.id, {
      select: { id: true, email: true, tenantId: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const limit = Math.min(100, Math.max(1, +req.query.limit || 40));
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { metadata: { path: ['userId'], equals: user.id } },
          {
            AND: [{ tenantId: user.tenantId }, { resource: user.email }],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        admin: { select: { id: true, email: true, name: true } },
        tenant: { select: { id: true, name: true } },
      },
    });
    res.json({ data: logs });
  } catch (err) {
    console.error('GET /users/:id/admin-activity', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — ficha completa (sem password)
router.get('/:id', async (req, res) => {
  try {
    const user = await findScopedUserOrNull(req, req.params.id, {
      include: {
        tenant: { select: { id: true, name: true, email: true, locale: { select: { countryCode: true } } } },
        technicianProfile: true,
        appAccount: { select: { emailNorm: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const admin = req.admin;
    const panelRole =
      admin && admin.panelUser ? String(admin.role || '').trim().toUpperCase() : null;
    if (panelRole === 'MANAGER' && String(user.role || '').toUpperCase() === 'SAAS_ADMIN') {
      return res.status(403).json({ error: 'Sem permissão para ver administrador da plataforma.' });
    }

    const { password, ...safe } = user;
    const loginEmailNorm = await resolveCanonicalEmailNormForUser(prisma, user);
    res.json({ ...safe, loginEmailNorm });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildTechnicianData(technician) {
  if (!technician || typeof technician !== 'object') return {};
  const data = {};
  if (technician.status != null) data.status = String(technician.status).toUpperCase();
  if (technician.cft !== undefined) data.cft = technician.cft ? String(technician.cft).trim() : null;
  if (technician.specialty !== undefined) data.specialty = technician.specialty ? String(technician.specialty).trim() : null;
  if (technician.score != null && Number.isFinite(Number(technician.score))) data.score = Number(technician.score);
  if (technician.workScheduleJson !== undefined) data.workScheduleJson = technician.workScheduleJson;
  if (technician.skillsJson !== undefined) data.skillsJson = technician.skillsJson;
  if (technician.serviceLocationIds !== undefined) data.serviceLocationIds = technician.serviceLocationIds;
  if (technician.serviceCoverageGeoJson !== undefined) {
    data.serviceCoverageGeoJson = normalizeServiceCoverageGeo(technician.serviceCoverageGeoJson);
  }
  if (technician.professionalDocuments !== undefined) data.professionalDocuments = technician.professionalDocuments;
  return data;
}

// PATCH /api/users/:id — atualização geral + perfil técnico
router.patch('/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await findScopedUserOrNull(req, id, {
      include: {
        technicianProfile: true,
        tenant: { select: { kind: true, locale: { select: { countryCode: true } } } },
      },
    });
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const admin = req.admin;
    const panelRole =
      admin && admin.panelUser ? String(admin.role || '').trim().toUpperCase() : null;

    if (panelRole === 'MANAGER' && String(existing.role || '').toUpperCase() === 'SAAS_ADMIN') {
      return res.status(403).json({ error: 'Sem permissão para editar administrador da plataforma.' });
    }

    const {
      name,
      email,
      phone,
      role,
      avatarUrl,
      isActive,
      addressJson,
      personalDocuments,
      faceEnrollmentPhotos,
      isProvider,
      technician,
      workTimeTrackingEnabled,
      workTimeEnrolledAt,
      workTimeBrazilRegime: bodyWorkTimeBrazilRegime,
      employeeMatricula: bodyEmployeeMatricula,
      preferredChatLocale: bodyPreferredChatLocale,
      adminInternalNotes: bodyAdminInternalNotes,
      emailVerifiedAt: bodyEmailVerifiedAt,
    } = req.body;

    const tenantIsBr =
      String(existing.tenant?.locale?.countryCode || '')
        .trim()
        .toUpperCase() === 'BR';

    if (
      bodyWorkTimeBrazilRegime !== undefined &&
      bodyWorkTimeBrazilRegime !== null &&
      String(bodyWorkTimeBrazilRegime).trim() !== ''
    ) {
      const r = String(bodyWorkTimeBrazilRegime).trim().toUpperCase();
      if (r !== 'CLT' && r !== 'PJ') {
        return res.status(400).json({ error: 'workTimeBrazilRegime deve ser CLT ou PJ.' });
      }
      if (!tenantIsBr) {
        return res.status(400).json({
          error:
            'O vínculo CLT/PJ no registro de horas só está disponível para organizações com perfil de país Brasil (BR) no tenant.',
        });
      }
    }

    if (faceEnrollmentPhotos !== undefined && !Array.isArray(faceEnrollmentPhotos)) {
      return res.status(400).json({ error: 'faceEnrollmentPhotos deve ser um array.' });
    }

    let prevRegistrationPrimary = null;
    if (faceEnrollmentPhotos !== undefined) {
      const prevFaces = normalizeFacePhotos(existing.faceEnrollmentPhotos);
      prevRegistrationPrimary = prevFaces.find(isRegistrationPrimaryFacePhoto);
      if (prevRegistrationPrimary) {
        const nextFaces = normalizeFacePhotos(faceEnrollmentPhotos);
        const kept = nextFaces.find(
          (p) =>
            p.id === prevRegistrationPrimary.id &&
            String(p.url || '') === String(prevRegistrationPrimary.url || '')
        );
        if (!kept) {
          return res.status(400).json({
            error:
              'A foto base do passo 1 do cadastro do prestador não pode ser removida nem alterada por esta via.',
          });
        }
      }
    }

    if (role != null && !USER_ROLES.has(String(role).toUpperCase())) {
      return res.status(400).json({ error: 'Papel inválido.' });
    }

    if (role != null) {
      const nextR = String(role).toUpperCase();
      const tenantKindErr = validatePanelRoleForTenantKind(existing.tenant?.kind, nextR);
      if (tenantKindErr) return res.status(400).json({ error: tenantKindErr });
      if (panelRole === 'MANAGER') {
        if (nextR === 'TENANT_ADMIN' || nextR === 'SAAS_ADMIN') {
          return res.status(403).json({ error: 'Sem permissão para atribuir este papel.' });
        }
      } else if (panelRole === 'TENANT_ADMIN') {
        if (nextR === 'SAAS_ADMIN') {
          return res.status(403).json({ error: 'Apenas administrador da plataforma pode atribuir papel SaaS.' });
        }
      }
      if (String(existing.role || '').toUpperCase() === 'SAAS_ADMIN' && nextR !== 'SAAS_ADMIN') {
        if (panelRole !== 'SAAS_ADMIN') {
          return res.status(403).json({
            error: 'Apenas administrador da plataforma pode alterar o papel desta conta.',
          });
        }
      }
    }

    if (email != null && String(email).toLowerCase().trim() !== existing.email.toLowerCase()) {
      const dup = await prisma.user.findFirst({
        where: {
          tenantId: existing.tenantId,
          email: String(email).trim().toLowerCase(),
          NOT: { id },
        },
      });
      if (dup) return res.status(400).json({ error: 'E-mail já em uso neste tenant.' });
    }

    if (bodyEmployeeMatricula !== undefined) {
      const norm = normalizeEmployeeMatricula(bodyEmployeeMatricula);
      if (norm) {
        const dupM = await prisma.user.findFirst({
          where: { tenantId: existing.tenantId, employeeMatricula: norm, NOT: { id } },
        });
        if (dupM) return res.status(400).json({ error: 'Matrícula já em uso nesta organização.' });
      }
    }

    if (bodyEmailVerifiedAt !== undefined && panelRole === 'MANAGER') {
      return res.status(403).json({ error: 'Sem permissão para alterar a verificação do e-mail.' });
    }

    const seatPatch = await assertTechnicianSeatForUserPatch(prisma, existing, { role, isActive });
    if (!seatPatch.ok) {
      return res.status(403).json({ error: seatPatch.error, code: seatPatch.code || 'PLAN_MAX_TECHNICIANS' });
    }

    let needsComprefaceSync = false;

    await prisma.$transaction(async (tx) => {
      const userPatch = {};
      if (name != null) userPatch.name = String(name).trim();
      if (email != null) {
        const nextE = String(email).trim().toLowerCase();
        userPatch.email = nextE;
        if (nextE !== existing.email.toLowerCase()) {
          userPatch.emailVerifiedAt = null;
          userPatch.emailVerificationToken = null;
          userPatch.emailVerificationExpiresAt = null;
        }
      }
      if (phone !== undefined) userPatch.phone = phone ? String(phone).trim() : null;
      if (role != null) userPatch.role = String(role).toUpperCase();
      if (avatarUrl !== undefined) {
        const nextA = avatarUrl ? ensureHttpsUrlForPublicInternet(String(avatarUrl).trim()) : null;
        const prevA = existing.avatarUrl ? String(existing.avatarUrl || '').trim() : null;
        userPatch.avatarUrl = nextA;
        if (nextA !== prevA) needsComprefaceSync = true;
      }
      if (typeof isActive === 'boolean') userPatch.isActive = isActive;
      if (typeof workTimeTrackingEnabled === 'boolean') {
        userPatch.workTimeTrackingEnabled = workTimeTrackingEnabled;
        if (workTimeTrackingEnabled && !existing.workTimeEnrolledAt) {
          userPatch.workTimeEnrolledAt = new Date();
        }
        if (!workTimeTrackingEnabled) {
          userPatch.workTimeEnrolledAt = null;
        }
      }
      if (workTimeEnrolledAt !== undefined) {
        if (workTimeEnrolledAt === null || workTimeEnrolledAt === '') {
          userPatch.workTimeEnrolledAt = null;
        } else {
          const d = new Date(workTimeEnrolledAt);
          if (!Number.isNaN(d.getTime())) userPatch.workTimeEnrolledAt = d;
        }
      }

      const nextWtEnabled =
        typeof workTimeTrackingEnabled === 'boolean'
          ? workTimeTrackingEnabled
          : !!existing.workTimeTrackingEnabled;

      if (!tenantIsBr) {
        if (existing.workTimeBrazilRegime != null) {
          userPatch.workTimeBrazilRegime = null;
        }
      } else if (!nextWtEnabled) {
        userPatch.workTimeBrazilRegime = null;
      } else if (bodyWorkTimeBrazilRegime !== undefined) {
        if (bodyWorkTimeBrazilRegime === null || String(bodyWorkTimeBrazilRegime).trim() === '') {
          userPatch.workTimeBrazilRegime = 'CLT';
        } else {
          userPatch.workTimeBrazilRegime = String(bodyWorkTimeBrazilRegime).trim().toUpperCase();
        }
      } else if (
        typeof workTimeTrackingEnabled === 'boolean' &&
        workTimeTrackingEnabled &&
        !existing.workTimeTrackingEnabled
      ) {
        userPatch.workTimeBrazilRegime = 'CLT';
      }

      if (addressJson !== undefined) userPatch.addressJson = addressJson;
      if (personalDocuments !== undefined) userPatch.personalDocuments = personalDocuments;
      if (bodyEmployeeMatricula !== undefined) {
        userPatch.employeeMatricula = normalizeEmployeeMatricula(bodyEmployeeMatricula);
      }
      if (bodyPreferredChatLocale !== undefined) {
        if (bodyPreferredChatLocale === null || bodyPreferredChatLocale === '') {
          userPatch.preferredChatLocale = null;
        } else {
          const pl = String(bodyPreferredChatLocale).trim().slice(0, 35);
          userPatch.preferredChatLocale = pl || null;
        }
      }
      if (bodyAdminInternalNotes !== undefined && panelRole !== 'MANAGER') {
        if (bodyAdminInternalNotes === null || bodyAdminInternalNotes === '') {
          userPatch.adminInternalNotes = null;
        } else {
          const n = String(bodyAdminInternalNotes).slice(0, 20000);
          userPatch.adminInternalNotes = n.trim() === '' ? null : n;
        }
      }
      if (bodyEmailVerifiedAt !== undefined) {
        if (bodyEmailVerifiedAt === null || bodyEmailVerifiedAt === false || bodyEmailVerifiedAt === '') {
          userPatch.emailVerifiedAt = null;
          userPatch.emailVerificationToken = null;
          userPatch.emailVerificationExpiresAt = null;
        } else {
          const d = bodyEmailVerifiedAt === true ? new Date() : new Date(String(bodyEmailVerifiedAt));
          if (!Number.isNaN(d.getTime())) {
            userPatch.emailVerifiedAt = d;
            userPatch.emailVerificationToken = null;
            userPatch.emailVerificationExpiresAt = null;
          }
        }
      }
      if (faceEnrollmentPhotos !== undefined) {
        needsComprefaceSync = true;
        let nextFaces = sortFaceEnrollmentPrimaryFirst(faceEnrollmentPhotos);
        if (prevRegistrationPrimary) {
          nextFaces = nextFaces.map((p) =>
            p.id === prevRegistrationPrimary.id
              ? { ...prevRegistrationPrimary, ...p, registrationPrimary: true }
              : p
          );
        }
        userPatch.faceEnrollmentPhotos = nextFaces;
      }

      if (Object.keys(userPatch).length) {
        await tx.user.update({ where: { id: existing.id }, data: userPatch });
      }

      const techPayload = buildTechnicianData(technician);
      const mergedRole = userPatch.role !== undefined ? userPatch.role : existing.role;
      const wantsProvider =
        mergedRole === 'PROVIDER' ||
        (userPatch.role === undefined && isProvider === true);

      /** Só desativa o prestador ao mudar o papel de PROVIDER para outro — não em cada gravação com papel já não-PROVIDER. */
      const demotedFromProvider =
        userPatch.role !== undefined &&
        existing.role === 'PROVIDER' &&
        mergedRole !== 'PROVIDER';

      if (demotedFromProvider && existing.technicianProfile) {
        await tx.technicianProfile.update({
          where: { userId: id },
          data: { status: 'INACTIVE' },
        });
      } else if (wantsProvider) {
        if (!existing.technicianProfile) {
          await tx.technicianProfile.create({
            data: {
              userId: existing.id,
              status: techPayload.status || 'PENDING',
              score: techPayload.score ?? 5,
              cft: techPayload.cft ?? null,
              specialty: techPayload.specialty ?? null,
              workScheduleJson: techPayload.workScheduleJson ?? undefined,
              skillsJson: techPayload.skillsJson ?? undefined,
              serviceLocationIds: techPayload.serviceLocationIds ?? undefined,
              professionalDocuments: techPayload.professionalDocuments ?? undefined,
            },
          });
        } else if (Object.keys(techPayload).length) {
          await tx.technicianProfile.update({
            where: { userId: existing.id },
            data: techPayload,
          });
        }
      } else if (existing.technicianProfile && Object.keys(techPayload).length) {
        await tx.technicianProfile.update({
          where: { userId: existing.id },
          data: techPayload,
        });
      }

    });

    if (needsComprefaceSync) {
      await syncComprefaceGalleryAfterUserChange(prisma, existing.id, req, 'user_patch');
    }

    try {
      const [tp, freshUser] = await Promise.all([
        prisma.technicianProfile.findUnique({
          where: { userId: id },
          select: { status: true },
        }),
        prisma.user.findUnique({ where: { id }, select: { isActive: true } }),
      ]);
      const techSt = String(tp?.status || '').toUpperCase();
      const userActive = freshUser?.isActive !== false;
      if (tp && !userActive) {
        await downsyncAffiliationsForSingleUserTechnician(prisma, id, 'INACTIVE');
        invalidateAppEffectiveTenantIdCache(id);
      } else if (tp && techSt === 'ACTIVE' && userActive) {
        await syncActiveAffiliationFromTechnicianStatus(prisma, {
          userId: id,
          tenantId: existing.tenantId,
          tenantKind: existing.tenant?.kind,
        });
      } else if (tp && techSt !== 'ACTIVE') {
        await downsyncAffiliationsForSingleUserTechnician(prisma, id, techSt);
        invalidateAppEffectiveTenantIdCache(id);
      }
    } catch (e) {
      console.error('[PATCH /users/:id] sync ProviderTenantAffiliation:', e?.message || e);
    }

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: existing.tenantId,
          action: 'USER_UPDATE_ADMIN',
          resource: existing.email,
          category: 'ADMIN',
          metadata: { userId: id },
        },
      })
      .catch(() => {});

    const fresh = await prisma.user.findUnique({
      where: { id: existing.id },
      include: {
        tenant: { select: { id: true, name: true, email: true } },
        technicianProfile: true,
        appAccount: { select: { emailNorm: true } },
      },
    });
    const { password, ...safe } = fresh;
    const loginEmailNorm = await resolveCanonicalEmailNormForUser(prisma, fresh);
    res.json({ ...safe, loginEmailNorm });
  } catch (err) {
    console.error('PATCH /users/:id', err);
    if (err.code === 'P2002') {
      const fields = Array.isArray(err.meta?.target) ? err.meta.target.map(String) : [];
      if (fields.some((f) => f.includes('employee_matricula'))) {
        return res.status(400).json({ error: 'Matrícula já em uso nesta organização.' });
      }
      return res.status(400).json({ error: 'Registo duplicado (e-mail ou outro campo único).' });
    }
    res.status(500).json({ error: err.message });
  }
});

function canAdminDeleteUser(authz) {
  if (isPlatformAdmin(authz)) return true;
  return (
    hasCapability(authz, 'tenant.users.write.any') ||
    hasCapability(authz, 'tenant.users.write.self') ||
    hasCapability(authz, 'tenant.users.write.limited')
  );
}

// DELETE /api/users/:id — remove o registo User neste tenant (membria duplicada / limpeza).
// Não remove AppAccount nem outros User do mesmo e-mail noutros tenants.
router.delete('/:id', async (req, res) => {
  try {
    const authz = req.authorization;
    if (!canAdminDeleteUser(authz)) {
      return res.status(403).json({ error: 'Sem permissão para eliminar utilizadores.' });
    }

    const { id } = req.params;
    const existing = await findScopedUserOrNull(req, id, {
      include: { tenant: { select: { id: true, kind: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const admin = req.admin;
    const panelRole =
      admin && admin.panelUser ? String(admin.role || '').trim().toUpperCase() : null;
    if (panelRole === 'MANAGER' && String(existing.role || '').toUpperCase() === 'SAAS_ADMIN') {
      return res.status(403).json({ error: 'Sem permissão para eliminar administrador da plataforma.' });
    }
    if (!isPlatformAdmin(authz) && String(existing.role || '').toUpperCase() === 'SAAS_ADMIN') {
      return res.status(403).json({ error: 'Apenas administrador da plataforma pode eliminar esta conta.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.updateMany({ where: { userId: existing.id }, data: { userId: null } });
      await tx.pushToken.deleteMany({ where: { userId: existing.id } });
      await tx.user.delete({ where: { id: existing.id } });
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: existing.tenantId,
          action: 'USER_DELETE_ADMIN',
          resource: existing.email,
          category: 'ADMIN',
          metadata: { userId: existing.id, tenantKind: existing.tenant?.kind || null },
        },
      })
      .catch(() => {});

    res.json({ ok: true, id: existing.id });
  } catch (err) {
    console.error('DELETE /users/:id', err);
    const code = err && err.code ? String(err.code) : '';
    if (code === 'P2003' || code === 'P2014') {
      return res.status(409).json({
        error:
          'Não foi possível eliminar: ainda existem dados ligados a este utilizador (OS, formulários, etc.). Desative a conta ou contacte suporte.',
      });
    }
    res.status(500).json({ error: err.message || 'Erro ao eliminar.' });
  }
});

module.exports = router;
