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
const { assertTechnicianSeatForNewUser, assertTechnicianSeatForUserPatch } = require('../lib/planQuotaService');
const { sendTransactionalEmailWithFallback } = require('../lib/transactionalEmailSend');
const {
  assertTenantAccess,
  isPlatformAdmin,
  normalizeRole,
  nonPlatformUserReadWhere,
  resolveScopedTenantId,
} = require('../lib/authorization');
const { normalizeServiceCoverageGeo } = require('../lib/technicianServiceCoverage');
const { validateAppPasswordPolicy } = require('../lib/appPasswordPolicy');

const MAX_FACE_ENROLLMENT_PHOTOS = 12;
const MAX_FACE_ENROLLMENT_BYTES = 5 * 1024 * 1024;
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
  return `${base}/verify-email.html?token=${encodeURIComponent(token)}`;
}

/** Matrícula funcional (ponto / RH). Vazio → null. Máx. 80 caracteres. */
function normalizeEmployeeMatricula(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, 80);
}

function normalizeFacePhotos(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((p) => p && typeof p === 'object' && p.id && p.url);
  return [];
}

function sortFaceEnrollmentPrimaryFirst(arr) {
  const list = normalizeFacePhotos(arr);
  const prim = list.filter(isRegistrationPrimaryFacePhoto);
  const rest = list.filter((p) => !isRegistrationPrimaryFacePhoto(p));
  return [...prim, ...rest];
}

function mimeToFaceExt(mt) {
  const m = String(mt || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return null;
}

/** Quando o browser envia `application/octet-stream` ou MIME vazio (comum em Android). */
function detectFaceExtFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  const head = buf.slice(0, 12);
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  // HEIC/HEIF (ISO BMFF): não suportado pelo pipeline atual
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (brand.includes('heic') || brand.includes('heix') || brand === 'mif1' || brand === 'msf1') return 'heic';
  }
  return null;
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
  tenant: { select: { id: true, name: true, email: true } },
  technicianProfile: { select: { id: true, status: true } },
  workTimeTrackingEnabled: true,
  addressJson: true,
  emailVerifiedAt: true,
  emailVerificationExpiresAt: true,
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
    res.json({ data: users, total, page: +page, sort: sortKey, sortDir: dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { name, email, password, tenantId, role: bodyRole = 'USER', employeeMatricula: rawMatricula } = req.body;
    const scopedTenantId = scopedTenantIdFromReq(req, tenantId);
    if (!name || !email || !password || !scopedTenantId) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    const pwCreate = validateAppPasswordPolicy(password);
    if (!pwCreate.ok) return res.status(400).json({ error: pwCreate.error });
    const role = String(bodyRole).toUpperCase();
    if (!USER_ROLES.has(role)) return res.status(400).json({ error: 'Papel inválido.' });
    if (!isPlatformAdmin(req.authorization) && role === 'SAAS_ADMIN') {
      return res.status(403).json({ error: 'Apenas a plataforma pode criar contas SaaS.' });
    }
    const employeeMatricula = normalizeEmployeeMatricula(rawMatricula);
    if (employeeMatricula) {
      const dup = await prisma.user.findFirst({ where: { tenantId: scopedTenantId, employeeMatricula } });
      if (dup) return res.status(400).json({ error: 'Matrícula já em uso nesta organização.' });
    }
    const seat = await assertTechnicianSeatForNewUser(prisma, scopedTenantId, role);
    if (!seat.ok) {
      return res.status(403).json({ error: seat.error, code: seat.code || 'PLAN_MAX_TECHNICIANS' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name, email, password: hash, tenantId: scopedTenantId, role, employeeMatricula },
      });
      if (role === 'PROVIDER') {
        await tx.technicianProfile.create({
          data: { userId: u.id, status: 'PENDING', score: 5 },
        });
      }
      return u;
    });
    const _a = auditActor(req);
    await prisma.auditLog.create({
      data: {
        ..._a,
        tenantId: scopedTenantId,
        action: 'USER_CREATE',
        resource: email,
        category: 'ADMIN',
        metadata: auditContextMetadata(req, { targetTenantId: scopedTenantId }),
      },
    });
    res
      .status(201)
      .json({ id: user.id, name: user.name, email: user.email, role: user.role, employeeMatricula: user.employeeMatricula });
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
    let user;
    if (tid) {
      user = await prisma.user.findFirst({
        where: {
          email: em,
          tenantId: tid,
          ...(isPlatformAdmin(req.authorization) ? {} : { NOT: { role: 'SAAS_ADMIN' } }),
        },
      });
    } else {
      const matches = await prisma.user.findMany({
        where: {
          email: em,
          ...(tid ? { tenantId: tid } : {}),
          ...(isPlatformAdmin(req.authorization) ? {} : { NOT: { role: 'SAAS_ADMIN' } }),
        },
        take: 12,
        select: { id: true },
      });
      if (matches.length === 0) {
        return res.status(404).json({ error: 'Nenhum utilizador encontrado com este e-mail.' });
      }
      if (matches.length > 1) {
        return res.status(400).json({
          error:
            'Vários utilizadores com este e-mail. Selecione a organização (tenant) ou utilize o reset a partir da linha na lista.',
        });
      }
      user = await findScopedUserOrNull(req, matches[0].id);
    }
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    const hash = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
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
    const user = await prisma.user.update({ where: { id: existing.id }, data: { password: hash } });
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

// POST /api/users/:id/face-enrollment — foto base para reconhecimento facial (JPEG/PNG/WebP, máx. 5 MB)
router.post('/:id/face-enrollment', async (req, res) => {
  try {
    const { id } = req.params;
    const { fileBase64, mimeType } = req.body;
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
    if (buf.length > MAX_FACE_ENROLLMENT_BYTES) {
      return res.status(400).json({ error: 'Imagem muito grande (máx. 5 MB).' });
    }
    if (buf.length < 64) return res.status(400).json({ error: 'Arquivo inválido.' });

    let ext = mimeToFaceExt(mimeType);
    if (!ext) ext = detectFaceExtFromBuffer(buf);
    if (ext === 'heic') {
      return res.status(400).json({
        error:
          'HEIC/HEIF não é suportado. No iPhone: Ajustes → Câmera → Formatos → «Mais compatível», ou exporte a foto como JPEG antes de enviar.',
      });
    }
    if (!ext) return res.status(400).json({ error: 'Use imagem JPEG, PNG ou WebP.' });

    const user = await findScopedUserOrNull(req, id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const list = normalizeFacePhotos(user.faceEnrollmentPhotos);
    if (list.length >= MAX_FACE_ENROLLMENT_PHOTOS) {
      return res.status(400).json({ error: `Limite de ${MAX_FACE_ENROLLMENT_PHOTOS} fotos base atingido.` });
    }

    const photoId = `fe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const fname = `${photoId}.${ext}`;
    const absDir = path.join(__dirname, '../../public/uploads/face-enrollment', id);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(path.join(absDir, fname), buf);

    const publicPath = `/uploads/face-enrollment/${id}/${fname}`;
    const createdAt = new Date().toISOString();
    const entry = {
      id: photoId,
      url: publicPath,
      mimeType: mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      createdAt,
    };
    const next = sortFaceEnrollmentPrimaryFirst([...list, entry]);

    await prisma.user.update({
      where: { id },
      data: { faceEnrollmentPhotos: next },
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: user.tenantId,
          action: 'USER_FACE_ENROLLMENT_ADD',
          resource: user.email,
          category: 'ADMIN',
          metadata: { userId: id, photoId },
        },
      })
      .catch(() => {});

    const { comprefaceSync, comprefaceRecognitionSync } = await syncComprefaceGalleryAfterUserChange(
      prisma,
      id,
      req,
      'face_enrollment_add',
    );

    res.status(201).json({ photo: entry, photos: next, comprefaceSync, comprefaceRecognitionSync });
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
    const user = await findScopedUserOrNull(req, id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const list = normalizeFacePhotos(user.faceEnrollmentPhotos);
    const found = list.find((p) => p.id === photoId);
    if (!found) return res.status(404).json({ error: 'Foto não encontrada.' });
    if (isRegistrationPrimaryFacePhoto(found)) {
      return res.status(400).json({
        error:
          'Esta foto é a do passo 1 do cadastro do prestador (referência principal) e não pode ser removida aqui. Ela só é substituída se o cadastro for refeito e aprovado de novo, ou se o usuário for excluído.',
      });
    }

    const next = sortFaceEnrollmentPrimaryFirst(list.filter((p) => p.id !== photoId));

    if (found.url && typeof found.url === 'string' && found.url.startsWith('/uploads/face-enrollment/')) {
      const rel = found.url.replace(/^\/uploads\//, '');
      const abs = path.join(__dirname, '../../public/uploads', ...rel.split('/'));
      try {
        await fs.unlink(abs);
      } catch {
        /* arquivo já ausente */
      }
    }

    await prisma.user.update({
      where: { id },
      data: { faceEnrollmentPhotos: next },
    });

    const { comprefaceSync, comprefaceRecognitionSync } = await syncComprefaceGalleryAfterUserChange(
      prisma,
      id,
      req,
      'face_enrollment_delete',
    );

    res.json({ photos: next, comprefaceSync, comprefaceRecognitionSync });
  } catch (err) {
    console.error('DELETE /users/:id/face-enrollment/:photoId', err);
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
    res.json(safe);
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
        tenant: { select: { locale: { select: { countryCode: true } } } },
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
        const nextA = avatarUrl ? String(avatarUrl).trim() : null;
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
      },
    });
    const { password, ...safe } = fresh;
    res.json(safe);
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

module.exports = router;
