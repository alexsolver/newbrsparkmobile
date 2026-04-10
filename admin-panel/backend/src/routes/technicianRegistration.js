'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs').promises;
const prisma = require('../db');
const { auditActor } = require('../lib/auditActor');
const { materializeApprovedApplication, normalizeFacePhotos } = require('../lib/technicianRegistrationMaterialize');
const { sendEmailViaNylas } = require('../lib/nylasSendEmail');
const { syncUserToCompreface } = require('../lib/comprefaceSync');
const { persistComprefaceRecognitionSync } = require('../lib/comprefaceRecognitionPersist');
const authUser = require('../middleware/authUser');
const optionalAuthUser = require('../middleware/optionalAuthUser');

const MAX_FACE_ENROLLMENT_BYTES = 5 * 1024 * 1024;
const MAX_FACE_ENROLLMENT_PHOTOS = 12;

const publicRouter = express.Router();
const adminRouter = express.Router();

function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

function mergeJsonResponses(existing, patch) {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  if (!patch || typeof patch !== 'object') return base;
  const tech = patch.technician;
  if (tech && typeof tech === 'object') {
    base.technician = {
      ...(typeof base.technician === 'object' ? base.technician : {}),
      ...tech,
    };
  }
  for (const k of Object.keys(patch)) {
    if (k === 'technician') continue;
    base[k] = patch[k];
  }
  return base;
}

function assertPanelTenantAccess(req, applicationTenantId) {
  const a = req.admin;
  if (!a?.panelUser) return true;
  if (!a.tenantId) return true;
  return applicationTenantId === a.tenantId;
}

function defaultEmptySchedule() {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const o = {};
  for (const d of days) {
    o[d] = [{ id: `s_${d}_0`, enabled: false, start: '08:00', end: '18:00', locationIds: [] }];
  }
  return o;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validateSubmitPayload(app, body) {
  const merged = mergeJsonResponses(app.responsesJson, body.responsesJson || body.responses || {});
  const email = String(merged.email || app.invitedEmail || '')
    .trim()
    .toLowerCase();
  if (email !== String(app.invitedEmail).trim().toLowerCase()) {
    return 'O e-mail deve ser o mesmo do convite.';
  }
  const name = String(merged.name || '').trim();
  if (!name) return 'Nome é obrigatório.';
  return null;
}

async function bindTechRegistrationCandidate(req, res, next) {
  try {
    const app = await prisma.technicianRegistrationApplication.findUnique({
      where: { inviteToken: req.params.token },
    });
    if (!app) return res.status(404).json({ error: 'Convite inválido.' });
    if (!req.user?.email) return res.status(401).json({ error: 'Inicie sessão no app com o e-mail do convite.' });
    const a = String(req.user.email).trim().toLowerCase();
    const b = String(app.invitedEmail).trim().toLowerCase();
    if (a !== b) {
      return res.status(403).json({
        error: 'Este convite foi enviado para outro e-mail. Use a conta BrSpark com o mesmo e-mail do convite.',
      });
    }
    req.techRegApp = app;
    await prisma.technicianRegistrationApplication
      .update({
        where: { id: app.id },
        data: { candidateUserId: req.user.id },
      })
      .catch(() => {});
    next();
  } catch (e) {
    next(e);
  }
}

// ─── Public (candidato — sessão obrigatória para editar; GET mínimo sem sessão) ─

publicRouter.get('/:token', optionalAuthUser, async (req, res) => {
  try {
    const { token } = req.params;
    const app = await prisma.technicianRegistrationApplication.findUnique({
      where: { inviteToken: token },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!app) return res.status(404).json({ error: 'Convite inválido ou expirado.' });
    if (['APPROVED', 'REJECTED'].includes(app.status)) {
      return res.json({
        closed: true,
        status: app.status,
        tenantName: app.tenant?.name,
        invitedEmail: app.invitedEmail,
      });
    }
    const u = req.appUser;
    const emailOk =
      u &&
      String(u.email || '')
        .trim()
        .toLowerCase() === String(app.invitedEmail).trim().toLowerCase();
    if (!emailOk) {
      return res.json({
        requiresAuth: true,
        status: app.status,
        tenantName: app.tenant?.name,
        invitedEmail: app.invitedEmail,
      });
    }
    await prisma.technicianRegistrationApplication
      .update({
        where: { id: app.id },
        data: { candidateUserId: u.id },
      })
      .catch(() => {});
    const locations = await prisma.location.findMany({
      where: { tenantId: app.tenantId },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    const responses =
      app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
    res.json({
      id: app.id,
      status: app.status,
      tenantName: app.tenant?.name,
      tenantId: app.tenantId,
      invitedEmail: app.invitedEmail,
      revisionNote: app.revisionNote,
      responsesJson: responses,
      locations,
      templateVersion: 1,
      requiresAuth: false,
    });
  } catch (err) {
    console.error('GET tech-reg public', err);
    res.status(500).json({ error: err.message });
  }
});

publicRouter.patch(
  '/:token/draft',
  express.json({ limit: '10mb' }),
  authUser,
  bindTechRegistrationCandidate,
  async (req, res) => {
    try {
      const app = req.techRegApp;
      if (['APPROVED', 'REJECTED'].includes(app.status)) {
        return res.status(400).json({ error: 'Esta candidatura já foi concluída.' });
      }
      if (app.status === 'SUBMITTED') {
        return res.status(400).json({ error: 'Candidatura aguarda análise. Não é possível alterar o rascunho agora.' });
      }
      const next = mergeJsonResponses(app.responsesJson, req.body.responsesJson || req.body);
      const updated = await prisma.technicianRegistrationApplication.update({
        where: { id: app.id },
        data: {
          responsesJson: next,
          status: 'DRAFT',
        },
      });
      res.json({ ok: true, responsesJson: updated.responsesJson, status: updated.status });
    } catch (err) {
      console.error('PATCH tech-reg draft', err);
      res.status(500).json({ error: err.message });
    }
  }
);

publicRouter.post(
  '/:token/submit',
  express.json({ limit: '10mb' }),
  authUser,
  bindTechRegistrationCandidate,
  async (req, res) => {
    try {
      const app = req.techRegApp;
      if (['APPROVED', 'REJECTED'].includes(app.status)) {
        return res.status(400).json({ error: 'Esta candidatura já foi concluída.' });
      }
      const errMsg = validateSubmitPayload(app, req.body);
      if (errMsg) return res.status(400).json({ error: errMsg });

      const pwd = String(req.body.password || '');
      if (!pwd) {
        return res.status(400).json({ error: 'Informe a senha da sua conta BrSpark para confirmar o envio.' });
      }
      const identity = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { password: true },
      });
      if (!identity?.password || !(await bcrypt.compare(pwd, identity.password))) {
        return res.status(400).json({ error: 'Senha incorreta. Use a mesma senha com que inicia sessão no app.' });
      }

      const merged = mergeJsonResponses(app.responsesJson, req.body.responsesJson || req.body.responses || {});
      if (!merged.technician || typeof merged.technician !== 'object') merged.technician = {};
      if (!merged.technician.workScheduleJson || typeof merged.technician.workScheduleJson !== 'object') {
        merged.technician.workScheduleJson = defaultEmptySchedule();
      }
      if (!Array.isArray(merged.technician.serviceLocationIds)) merged.technician.serviceLocationIds = [];
      if (!Array.isArray(merged.personalDocuments)) merged.personalDocuments = [];
      if (!Array.isArray(merged.technician.professionalDocuments)) merged.technician.professionalDocuments = [];

      const updated = await prisma.technicianRegistrationApplication.update({
        where: { id: app.id },
        data: {
          responsesJson: merged,
          passwordHash: identity.password,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          revisionNote: null,
        },
      });
      await prisma.technicianRegistrationEvent.create({
        data: {
          applicationId: app.id,
          type: 'SUBMITTED',
          message: null,
          actorEmail: merged.email || app.invitedEmail,
        },
      });
      res.json({ ok: true, status: updated.status });
    } catch (err) {
      console.error('POST tech-reg submit', err);
      res.status(500).json({ error: err.message });
    }
  }
);

function mimeToFaceExt(mt) {
  const m = String(mt || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return null;
}

function detectFaceExtFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  const head = buf.slice(0, 12);
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

publicRouter.post(
  '/:token/face-enrollment',
  express.json({ limit: '15mb' }),
  authUser,
  bindTechRegistrationCandidate,
  async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    const app = req.techRegApp;
    if (['APPROVED', 'REJECTED'].includes(app.status)) {
      return res.status(400).json({ error: 'Candidatura encerrada.' });
    }
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
    let ext = mimeToFaceExt(mimeType);
    if (!ext) ext = detectFaceExtFromBuffer(buf);
    if (ext === 'heic') {
      return res.status(400).json({
        error:
          'HEIC não é suportado. No iPhone use formatos compatíveis (JPEG) ou exporte a foto antes de enviar.',
      });
    }
    if (!ext) return res.status(400).json({ error: 'Use imagem JPEG, PNG ou WebP.' });

    const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
    const list = normalizeFacePhotos(raw.faceEnrollmentPhotos);
    if (list.length >= MAX_FACE_ENROLLMENT_PHOTOS) {
      return res.status(400).json({ error: `Limite de ${MAX_FACE_ENROLLMENT_PHOTOS} fotos.` });
    }

    const photoId = `fe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const fname = `${photoId}.${ext}`;
    const absDir = path.join(__dirname, '../../public/uploads/tech-registration', app.id);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(path.join(absDir, fname), buf);
    const publicPath = `/uploads/tech-registration/${app.id}/${fname}`;
    const createdAt = new Date().toISOString();
    const entry = {
      id: photoId,
      url: publicPath,
      mimeType: mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      createdAt,
    };
    const next = [...list, entry];
    const nextJson = { ...raw, faceEnrollmentPhotos: next };
    await prisma.technicianRegistrationApplication.update({
      where: { id: app.id },
      data: { responsesJson: nextJson },
    });
    res.status(201).json({ photo: entry, photos: next });
  } catch (err) {
    console.error('POST tech-reg face', err);
    res.status(500).json({ error: err.message });
  }
  }
);

publicRouter.delete('/:token/face-enrollment/:photoId', authUser, bindTechRegistrationCandidate, async (req, res) => {
  try {
    const { photoId } = req.params;
    const app = req.techRegApp;
    const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
    const list = normalizeFacePhotos(raw.faceEnrollmentPhotos);
    const found = list.find((p) => p.id === photoId);
    if (!found) return res.status(404).json({ error: 'Foto não encontrada.' });
    const next = list.filter((p) => p.id !== photoId);
    if (found.url && String(found.url).startsWith(`/uploads/tech-registration/${app.id}/`)) {
      const rel = String(found.url).replace(/^\/uploads\//, '');
      const abs = path.join(__dirname, '../../public/uploads', ...rel.split('/'));
      try {
        await fs.unlink(abs);
      } catch {
        /* ok */
      }
    }
    await prisma.technicianRegistrationApplication.update({
      where: { id: app.id },
      data: { responsesJson: { ...raw, faceEnrollmentPhotos: next } },
    });
    res.json({ photos: next });
  } catch (err) {
    console.error('DELETE tech-reg face', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin / gestor ──────────────────────────────────────────────────────────

adminRouter.get('/', async (req, res) => {
  try {
    const { status, tenantId: qTenant } = req.query;
    const a = req.admin;
    let tenantFilter = qTenant || null;
    if (a?.panelUser && a.tenantId) tenantFilter = a.tenantId;

    const where = {};
    if (tenantFilter) where.tenantId = tenantFilter;
    if (status) where.status = String(status);

    const rows = await prisma.technicianRegistrationApplication.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        tenant: { select: { id: true, name: true } },
        createdUser: { select: { id: true, email: true, name: true } },
      },
    });
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        tenantName: r.tenant?.name,
        invitedEmail: r.invitedEmail,
        status: r.status,
        submittedAt: r.submittedAt,
        resolvedAt: r.resolvedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdUserId: r.createdUserId,
        createdUserEmail: r.createdUser?.email,
      })),
    });
  } catch (err) {
    console.error('GET tech-reg list', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/invite', express.json(), async (req, res) => {
  try {
    const { email, tenantId: bodyTenant } = req.body;
    if (!email || !String(email).trim()) return res.status(400).json({ error: 'E-mail é obrigatório.' });
    const a = req.admin;
    let tenantId = bodyTenant || null;
    if (a?.panelUser && a.tenantId) tenantId = a.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório (ou inicie sessão no contexto do tenant).' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado.' });

    const em = String(email).trim().toLowerCase();
    const anyAppAccount = await prisma.user.findFirst({
      where: { email: em },
      select: { id: true },
    });
    if (!anyAppAccount) {
      return res.status(400).json({
        error:
          'Este e-mail ainda não tem conta no BrSpark. O prestador deve criar conta no app (cadastro) com este e-mail antes do convite.',
      });
    }
    const existingUser = await prisma.user.findFirst({ where: { tenantId, email: em } });
    if (existingUser) return res.status(409).json({ error: 'Já existe utilizador com este e-mail neste tenant.' });

    const pending = await prisma.technicianRegistrationApplication.findFirst({
      where: {
        tenantId,
        invitedEmail: em,
        status: { in: ['INVITED', 'DRAFT', 'SUBMITTED', 'NEEDS_REVISION'] },
      },
    });
    if (pending) return res.status(409).json({ error: 'Já existe uma candidatura em curso para este e-mail.' });

    const token = generateInviteToken();
    const actorEmail = a?.email || null;
    const createdByUserId = a?.panelUser && a.userId ? a.userId : null;

    const app = await prisma.technicianRegistrationApplication.create({
      data: {
        tenantId,
        inviteToken: token,
        invitedEmail: em,
        status: 'INVITED',
        responsesJson: {
          email: em,
          name: '',
          technician: {
            workScheduleJson: defaultEmptySchedule(),
            serviceLocationIds: [],
            professionalDocuments: [],
            skillsJson: [],
          },
          personalDocuments: [],
          faceEnrollmentPhotos: [],
        },
        createdByUserId,
      },
    });
    await prisma.technicianRegistrationEvent.create({
      data: {
        applicationId: app.id,
        type: 'CREATED',
        message: null,
        actorEmail,
      },
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId,
          action: 'TECH_REGISTRATION_INVITE',
          resource: em,
          category: 'ADMIN',
          metadata: { applicationId: app.id },
        },
      })
      .catch(() => {});

    const deepLinkHint = `brspark://auth/tech-registration?token=${token}`;
    const textBody = [
      'Olá,',
      '',
      `${tenant.name} convidou você a concluir o cadastro de prestador no BrSpark.`,
      `Utilize a conta BrSpark já registada com o e-mail ${em} e abra o convite no app.`,
      '',
      `Abrir no app: ${deepLinkHint}`,
      '',
      'Se o link não abrir, abra o BrSpark, inicie sessão com este e-mail e utilize o fluxo de cadastro por convite com o token fornecido pelo gestor.',
    ].join('\n');

    const htmlBody = `<p>Olá,</p>
<p><strong>${escapeHtml(tenant.name)}</strong> convidou você a concluir o <strong>cadastro de prestador</strong> no BrSpark.</p>
<p>Utilize a conta já registada com o e-mail <strong>${escapeHtml(em)}</strong> e abra o convite no app.</p>
<p><a href="${escapeHtml(deepLinkHint)}">Abrir convite no app</a></p>
<p style="font-size:12px;color:#555">Se o botão não funcionar, copie o link acima para o navegador ou abra o app manualmente após iniciar sessão.</p>`;

    let emailInfo = { sent: false, skipped: true, detail: null };
    try {
      const send = await sendEmailViaNylas({
        to: { email: em },
        subject: `Convite BrSpark — cadastro de prestador (${tenant.name})`,
        text: textBody,
        html: htmlBody,
      });
      if (send.skipped) {
        emailInfo = { sent: false, skipped: true, detail: send.reason || null };
      } else if (send.ok) {
        emailInfo = { sent: true, skipped: false, detail: null };
      } else {
        emailInfo = { sent: false, skipped: false, detail: send.error || 'Falha no envio.' };
        console.error('[tech-reg invite] Nylas:', send.error);
      }
    } catch (e) {
      emailInfo = { sent: false, skipped: false, detail: e.message || String(e) };
      console.error('[tech-reg invite] e-mail:', e);
    }

    res.status(201).json({
      id: app.id,
      inviteToken: token,
      invitedEmail: em,
      /** Caminho relativo para o app: /auth/tech-registration?token= */
      deepLinkHint,
      email: emailInfo,
    });
  } catch (err) {
    console.error('POST tech-reg invite', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/:id', async (req, res) => {
  try {
    const app = await prisma.technicianRegistrationApplication.findUnique({
      where: { id: req.params.id },
      include: {
        tenant: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: 'asc' } },
        createdUser: { select: { id: true, email: true, name: true } },
      },
    });
    if (!app) return res.status(404).json({ error: 'Não encontrado.' });
    if (!assertPanelTenantAccess(req, app.tenantId)) {
      return res.status(403).json({ error: 'Sem permissão.' });
    }
    const locations = await prisma.location.findMany({
      where: { tenantId: app.tenantId },
      select: { id: true, name: true, type: true },
      orderBy: { name: 'asc' },
    });
    const { passwordHash: _ph, inviteToken: _tok, ...rest } = app;
    res.json({ ...rest, locations });
  } catch (err) {
    console.error('GET tech-reg id', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/:id/request-revision', express.json(), async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Indique a mensagem para o candidato.' });
    const app = await prisma.technicianRegistrationApplication.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: 'Não encontrado.' });
    if (!assertPanelTenantAccess(req, app.tenantId)) return res.status(403).json({ error: 'Sem permissão.' });
    if (app.status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Só é possível pedir ajustes com candidatura submetida.' });
    }
    const a = req.admin;
    await prisma.technicianRegistrationApplication.update({
      where: { id: app.id },
      data: { status: 'NEEDS_REVISION', revisionNote: message },
    });
    await prisma.technicianRegistrationEvent.create({
      data: {
        applicationId: app.id,
        type: 'REVISION_REQUESTED',
        message,
        actorEmail: a?.email || null,
      },
    });
    res.json({ ok: true, status: 'NEEDS_REVISION' });
  } catch (err) {
    console.error('POST tech-reg revision', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post('/:id/approve', async (req, res) => {
  try {
    const app = await prisma.technicianRegistrationApplication.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: 'Não encontrado.' });
    if (!assertPanelTenantAccess(req, app.tenantId)) return res.status(403).json({ error: 'Sem permissão.' });

    const user = await materializeApprovedApplication(prisma, app.id);
    try {
      const r = await syncUserToCompreface(prisma, user.id);
      await persistComprefaceRecognitionSync(prisma, user.id, r);
    } catch (e) {
      console.warn('[tech-reg] CompreFace após aprovação', e);
    }

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: app.tenantId,
          action: 'TECH_REGISTRATION_APPROVED',
          resource: user.email,
          category: 'ADMIN',
          metadata: { applicationId: app.id, userId: user.id },
        },
      })
      .catch(() => {});

    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      include: { technicianProfile: true, tenant: { select: { name: true } } },
    });
    const { password, ...safe } = fresh;
    res.json({ ok: true, user: safe });
  } catch (err) {
    console.error('POST tech-reg approve', err);
    res.status(400).json({ error: err.message || String(err) });
  }
});

adminRouter.post('/:id/reject', express.json(), async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Indique o motivo da recusa.' });
    const app = await prisma.technicianRegistrationApplication.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: 'Não encontrado.' });
    if (!assertPanelTenantAccess(req, app.tenantId)) return res.status(403).json({ error: 'Sem permissão.' });
    if (['APPROVED', 'REJECTED'].includes(app.status)) {
      return res.status(400).json({ error: 'Candidatura já encerrada.' });
    }
    const a = req.admin;
    await prisma.technicianRegistrationApplication.update({
      where: { id: app.id },
      data: {
        status: 'REJECTED',
        resolvedAt: new Date(),
        revisionNote: reason,
        passwordHash: null,
      },
    });
    await prisma.technicianRegistrationEvent.create({
      data: {
        applicationId: app.id,
        type: 'REJECTED',
        message: reason,
        actorEmail: a?.email || null,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST tech-reg reject', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { publicRouter, adminRouter };
