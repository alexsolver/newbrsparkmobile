'use strict';
const router = require('express').Router();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');
const { sendExpoPushToMany } = require('../services/expoPush');
const { syncUserToCompreface } = require('../lib/comprefaceSync');
const { persistComprefaceRecognitionSync } = require('../lib/comprefaceRecognitionPersist');
const { isRegistrationPrimaryFacePhoto } = require('../lib/faceEnrollmentPrimary');
const { assertTechnicianSeatForNewUser, assertTechnicianSeatForUserPatch } = require('../lib/planQuotaService');

const MAX_FACE_ENROLLMENT_PHOTOS = 12;
const MAX_FACE_ENROLLMENT_BYTES = 5 * 1024 * 1024;

const USER_ROLES = new Set(['USER', 'PROVIDER', 'MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN']);

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
};

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const { tenantId, role, q, page = 1, limit = 50, workTime } = req.query;
    const where = {
      ...(tenantId && { tenantId }),
      ...(role && { role }),
      ...(workTime === '1' && { workTimeTrackingEnabled: true }),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { employeeMatricula: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        select: userListSelect,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ data: users, total, page: +page });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { name, email, password, tenantId, role: bodyRole = 'USER', employeeMatricula: rawMatricula } = req.body;
    if (!name || !email || !password || !tenantId) return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    const role = String(bodyRole).toUpperCase();
    if (!USER_ROLES.has(role)) return res.status(400).json({ error: 'Papel inválido.' });
    const employeeMatricula = normalizeEmployeeMatricula(rawMatricula);
    if (employeeMatricula) {
      const dup = await prisma.user.findFirst({ where: { tenantId, employeeMatricula } });
      if (dup) return res.status(400).json({ error: 'Matrícula já em uso nesta organização.' });
    }
    const seat = await assertTechnicianSeatForNewUser(prisma, tenantId, role);
    if (!seat.ok) {
      return res.status(403).json({ error: seat.error, code: seat.code || 'PLAN_MAX_TECHNICIANS' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name, email, password: hash, tenantId, role, employeeMatricula },
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
      data: { ..._a, tenantId, action: 'USER_CREATE', resource: email, category: 'ADMIN' },
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

// PATCH /api/users/:id/reset-password
router.patch('/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'Nova senha ausente.' });
    const hash = await bcrypt.hash(newPassword, 10);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { password: hash } });
    const _a2 = auditActor(req);
    await prisma.auditLog.create({
      data: { ..._a2, action: 'USER_RESET_PASSWORD', resource: user.email, category: 'ADMIN' },
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

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
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
    const current = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: !current.isActive } });
    res.json({ id: user.id, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/disconnect
router.post('/:id/disconnect', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    await prisma.user.update({
      where: { id: req.params.id },
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

    const user = await prisma.user.findUnique({ where: { id } });
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
      data: {
        faceEnrollmentPhotos: next,
        comprefaceRecognitionSync: {
          status: 'pending',
          at: new Date().toISOString(),
          message: 'Novas fotos de matrícula — a sincronizar com a galeria CompreFace.',
        },
      },
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

    const row = await prisma.user.findUnique({
      where: { id },
      select: { comprefaceRecognitionSync: true },
    });

    res.status(201).json({ photo: entry, photos: next, comprefaceRecognitionSync: row?.comprefaceRecognitionSync });
  } catch (err) {
    console.error('POST /users/:id/face-enrollment', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users/:id/sync-compreface — envia avatar + matrícula ao CompreFace (galeria Recognition)
router.post('/:id/sync-compreface', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await syncUserToCompreface(prisma, id);
    await persistComprefaceRecognitionSync(prisma, id, result);
    const row = await prisma.user.findUnique({
      where: { id },
      select: { email: true, tenantId: true, comprefaceRecognitionSync: true },
    });
    const syncPayload = row?.comprefaceRecognitionSync;

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.error || 'Falha na sincronização.',
        comprefaceRecognitionSync: syncPayload,
      });
    }
    if (row) {
      await prisma.auditLog
        .create({
          data: {
            ...auditActor(req),
            tenantId: row.tenantId,
            action: 'USER_COMPREFACE_SYNC',
            resource: row.email,
            category: 'ADMIN',
            metadata: {
              userId: id,
              subject: result.subject,
              faces: result.faces,
              ...(result.orphanSubjectsCleaned
                ? { orphanSubjectsCleaned: result.orphanSubjectsCleaned }
                : {}),
            },
          },
        })
        .catch(() => {});
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
    const user = await prisma.user.findUnique({ where: { id } });
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

    let comprefaceSync = null;
    try {
      const r = await syncUserToCompreface(prisma, id);
      comprefaceSync = r.ok
        ? { ok: true, subject: r.subject, faces: r.faces }
        : { ok: false, error: r.error || 'Falha na sincronização.' };
      await persistComprefaceRecognitionSync(prisma, id, r);
      if (r.ok) {
        await prisma.auditLog
          .create({
            data: {
              ...auditActor(req),
              tenantId: user.tenantId,
              action: 'USER_COMPREFACE_SYNC',
              resource: user.email,
              category: 'ADMIN',
              metadata: {
                userId: id,
                subject: r.subject,
                faces: r.faces,
                trigger: 'face_enrollment_delete',
                ...(r.orphanSubjectsCleaned ? { orphanSubjectsCleaned: r.orphanSubjectsCleaned } : {}),
              },
            },
          })
          .catch(() => {});
      }
    } catch (e) {
      comprefaceSync = { ok: false, error: e.message || String(e) };
      await persistComprefaceRecognitionSync(prisma, id, { ok: false, error: comprefaceSync.error });
    }

    const rowCf = await prisma.user.findUnique({
      where: { id },
      select: { comprefaceRecognitionSync: true },
    });

    res.json({ photos: next, comprefaceSync, comprefaceRecognitionSync: rowCf?.comprefaceRecognitionSync });
  } catch (err) {
    console.error('DELETE /users/:id/face-enrollment/:photoId', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/:id — ficha completa (sem password)
router.get('/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        tenant: { select: { id: true, name: true, email: true } },
        technicianProfile: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
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
  if (technician.professionalDocuments !== undefined) data.professionalDocuments = technician.professionalDocuments;
  return data;
}

// PATCH /api/users/:id — atualização geral + perfil técnico
router.patch('/:id', express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.user.findUnique({
      where: { id },
      include: { technicianProfile: true },
    });
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });

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
      employeeMatricula: bodyEmployeeMatricula,
    } = req.body;

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

    const seatPatch = await assertTechnicianSeatForUserPatch(prisma, existing, { role, isActive });
    if (!seatPatch.ok) {
      return res.status(403).json({ error: seatPatch.error, code: seatPatch.code || 'PLAN_MAX_TECHNICIANS' });
    }

    await prisma.$transaction(async (tx) => {
      const userPatch = {};
      if (name != null) userPatch.name = String(name).trim();
      if (email != null) userPatch.email = String(email).trim().toLowerCase();
      if (phone !== undefined) userPatch.phone = phone ? String(phone).trim() : null;
      if (role != null) userPatch.role = String(role).toUpperCase();
      if (avatarUrl !== undefined) {
        userPatch.avatarUrl = avatarUrl ? String(avatarUrl).trim() : null;
        userPatch.comprefaceRecognitionSync = {
          status: 'pending',
          at: new Date().toISOString(),
          message: 'Avatar alterado — sincronize a galeria CompreFace.',
        };
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
      if (addressJson !== undefined) userPatch.addressJson = addressJson;
      if (personalDocuments !== undefined) userPatch.personalDocuments = personalDocuments;
      if (bodyEmployeeMatricula !== undefined) {
        userPatch.employeeMatricula = normalizeEmployeeMatricula(bodyEmployeeMatricula);
      }
      if (faceEnrollmentPhotos !== undefined) {
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
        await tx.user.update({ where: { id }, data: userPatch });
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
              userId: id,
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
            where: { userId: id },
            data: techPayload,
          });
        }
      } else if (existing.technicianProfile && Object.keys(techPayload).length) {
        await tx.technicianProfile.update({
          where: { userId: id },
          data: techPayload,
        });
      }

    });

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
      where: { id },
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
