'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../db');
const crypto  = require('crypto');
const { initialTechRegistrationResponsesJson } = require('../lib/techRegistrationDefaults');
const { sendExpoPushToMany } = require('../services/expoPush');

// /api/vision/* — biometria de campo / checklists (CompreFace conforme plano). Gate IA do cadastro prestador: index.js → /api/ai-technician-profile-photo.
const visionRouter = require('./vision');
router.use('/vision', visionRouter);

/**
 * Tenant onde novos utilizadores do app móvel são registados (consumidor / prestador individual).
 * Defina APP_DEFAULT_TENANT_SLUG (ex.: brspark-app) ou APP_DEFAULT_TENANT_ID.
 * Se vazio, mantém o modo legado: um Tenant novo por registo (TENANT_ADMIN).
 */
async function resolveAppDefaultTenantId() {
  const idRaw = (process.env.APP_DEFAULT_TENANT_ID || '').trim();
  if (idRaw) {
    const t = await prisma.tenant.findUnique({ where: { id: idRaw } });
    return t ? t.id : null;
  }
  const slugRaw = (process.env.APP_DEFAULT_TENANT_SLUG || '').trim();
  if (!slugRaw) return null;
  const t = await prisma.tenant.findFirst({
    where: { slug: { equals: slugRaw, mode: 'insensitive' } },
  });
  return t ? t.id : null;
}

// ─── POST /api/register ─────────────────────────────────────────────────────
// Público — registo no app: tenant padrão (USER) ou modo legado (Tenant + TENANT_ADMIN)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, defaultLang = 'pt-BR', deviceId } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });

    const emailNorm = String(email).trim().toLowerCase();
    const hash = await bcrypt.hash(password, 10);
    const defaultTenantId = await resolveAppDefaultTenantId();

    let tenant;
    let user;

    if (defaultTenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: defaultTenantId } });
      if (!tenant) {
        return res.status(500).json({
          error:
            'Configuração inválida: tenant padrão do app não encontrado. Contacte o suporte.',
        });
      }
      if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
        return res.status(403).json({ error: 'Novos registos estão temporariamente indisponíveis.' });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email_tenantId: { email: emailNorm, tenantId: defaultTenantId } },
      });
      if (existingUser) {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
      }

      const result = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            name: String(name).trim(),
            email: emailNorm,
            password: hash,
            tenantId: defaultTenantId,
            phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
            role: 'USER',
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: defaultTenantId,
            userId: u.id,
            action: 'USER_REGISTER',
            resource: emailNorm,
            category: 'AUTH',
          },
        });
        return u;
      });
      user = result;
    } else {
      const existing = await prisma.tenant.findUnique({ where: { email: emailNorm } });
      if (existing) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });

      const baseSlug = emailNorm.split('@')[0].replace(/[^a-z0-9]/g, '-') || 'conta';
      let slug = baseSlug;
      let suffix = 0;
      while (await prisma.tenant.findUnique({ where: { slug } })) {
        suffix++;
        slug = `${baseSlug}-${suffix}`;
      }

      const result = await prisma.$transaction(async (tx) => {
        const t = await tx.tenant.create({
          data: {
            name: String(name).trim(),
            slug,
            email: emailNorm,
            ownerName: String(name).trim(),
            phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
            defaultLang,
            status: 'TRIAL',
          },
        });

        const u = await tx.user.create({
          data: {
            name: String(name).trim(),
            email: emailNorm,
            password: hash,
            tenantId: t.id,
            role: 'TENANT_ADMIN',
          },
        });

        await tx.auditLog.create({
          data: { tenantId: t.id, userId: u.id, action: 'USER_REGISTER', resource: emailNorm, category: 'AUTH' },
        });

        return { tenant: t, user: u };
      });
      tenant = result.tenant;
      user = result.user;
    }

    const newSessionId = crypto.randomUUID();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        currentSessionId: newSessionId,
        currentDeviceId: deviceId || null,
      },
    });

    const token = jwt.sign(
      {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        sessionId: newSessionId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/login ─────────────────────────────────────────────────────────
// Público — login do usuário do app (retorna JWT com tenantId)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });

    const emailNorm = String(email).trim().toLowerCase();
    const candidates = await prisma.user.findMany({
      where: { email: emailNorm },
      include: { tenant: true, technicianProfile: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!candidates.length) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const tenantIdPick = req.body.tenantId != null && String(req.body.tenantId).trim() !== '' ? String(req.body.tenantId).trim() : null;

    let user;
    if (candidates.length === 1) {
      user = candidates[0];
    } else if (tenantIdPick) {
      user = candidates.find((u) => u.tenantId === tenantIdPick);
      if (!user) {
        return res.status(400).json({ error: 'Organização inválida para este e-mail.' });
      }
    } else {
      return res.status(409).json({
        code: 'MULTIPLE_ACCOUNTS',
        error:
          'Este e-mail está em mais de uma organização. Indique qual deseja aceder (tenantId) ou escolha no ecrã.',
        tenants: candidates.map((u) => ({
          id: u.tenantId,
          name: u.tenant?.name || u.tenantId,
        })),
      });
    }

    if (!user.tenant) return res.status(401).json({ error: 'Credenciais inválidas.' });

    if (!user.isActive)
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });

    if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED')
      return res.status(403).json({ error: 'Conta suspensa ou cancelada.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas.' });

    // Handle single-device session
    const { deviceId } = req.body;
    const newSessionId = crypto.randomUUID();

    // Notificar outros dispositivos: sessão anterior existia e o deviceId mudou (ou antes era desconhecido)
    const prevDevice = user.currentDeviceId != null ? String(user.currentDeviceId) : '';
    const nextDevice = deviceId != null ? String(deviceId) : '';
    const shouldNotifyOtherDevice = user.currentSessionId && prevDevice !== nextDevice;
    if (shouldNotifyOtherDevice) {
      const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
      if (tokens.length > 0) {
        sendExpoPushToMany(tokens, {
          data: { type: 'FORCE_LOGOUT', reason: 'NEW_LOGIN' }
        }).catch(err => console.error('[login_kickout]', err));
      }
    }

    await prisma.user.update({ 
      where: { id: user.id }, 
      data: { 
        lastLogin: new Date(),
        currentSessionId: newSessionId,
        currentDeviceId: deviceId || null 
      } 
    });

    await prisma.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.id, action: 'USER_LOGIN', resource: email, category: 'AUTH' }
    });

    const token = jwt.sign(
      { id: user.id, tenantId: user.tenantId, email: user.email, role: user.role, sessionId: newSessionId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        tenantId: user.tenantId,
        tenant: { id: user.tenant.id, name: user.tenant.name, status: user.tenant.status },
        technicianProfile: user.technicianProfile,
      },
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/me ─────────────────────────────────────────────────────────────
// Autenticado — retorna perfil do usuário logado (para o app)
const authUser = require('../middleware/authUser');
const { handleTechnicianProfilePhotoAiValidate } = require('../lib/handleTechnicianProfilePhotoAiValidate');
router.get('/me', authUser, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { 
        tenant: { include: { subscription: { include: { plan: true } } } },
        technicianProfile: true
      },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const { password: _, ...safe } = user;
    res.json(safe);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/me ─────────────────────────────────────────────────────────────
// Autenticado — atualiza perfil do usuário logado
router.put('/me', authUser, async (req, res) => {
  try {
    const { name, email, avatarUrl } = req.body;
    
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { 
        ...(name && { name }), 
        ...(email && { email }), 
        ...(avatarUrl !== undefined && { avatarUrl }) 
      }
    });

    const { password: _, ...safe } = updated;
    res.json(safe);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

function generateTechRegInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ─── POST /api/me/validate-technician-profile-photo ─────────────────────────
// Gate IA do passo 1 (cadastro prestador). Mesmo handler que /api/ai-technician-profile-photo/validate e /api/technician-registration/public/:token/validate-profile-photo.
router.post('/me/validate-technician-profile-photo', authUser, handleTechnicianProfilePhotoAiValidate);

// ─── GET /api/me/technician-registration ─────────────────────────────────────
// Candidatura em aberto (continuar formulário) — mesmo e-mail + tenant da sessão.
router.get('/me/technician-registration', authUser, async (req, res) => {
  try {
    const em = String(req.user.email || '')
      .trim()
      .toLowerCase();
    const tenantId = req.user.tenantId;
    const openStatuses = ['INVITED', 'DRAFT', 'NEEDS_REVISION'];
    const app = await prisma.technicianRegistrationApplication.findFirst({
      where: { tenantId, invitedEmail: em, status: { in: openStatuses } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, inviteToken: true, status: true },
    });
    const submittedRow = await prisma.technicianRegistrationApplication.findFirst({
      where: { tenantId, invitedEmail: em, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      select: { id: true },
    });
    const submittedAwaitingReview = !!submittedRow;
    if (!app) {
      return res.json({ open: false, submittedAwaitingReview });
    }
    res.json({
      open: true,
      inviteToken: app.inviteToken,
      status: app.status,
      id: app.id,
      submittedAwaitingReview: false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/me/technician ─────────────────────────────────────────────────
// Autenticado — pedido de prestador: TechnicianProfile PENDING + candidatura (token) para o formulário completo no app.
router.post('/me/technician', authUser, async (req, res) => {
  try {
    const existing = await prisma.technicianProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (existing && String(existing.status || '').toUpperCase() === 'ACTIVE') {
      return res.status(400).json({
        error: 'Sua conta já está habilitada como prestador.',
      });
    }

    const em = String(req.user.email || '')
      .trim()
      .toLowerCase();
    const tenantId = req.user.tenantId;

    const openStatuses = ['INVITED', 'DRAFT', 'NEEDS_REVISION'];
    const openApp = await prisma.technicianRegistrationApplication.findFirst({
      where: { tenantId, invitedEmail: em, status: { in: openStatuses } },
      orderBy: { updatedAt: 'desc' },
    });

    const submittedApp = await prisma.technicianRegistrationApplication.findFirst({
      where: { tenantId, invitedEmail: em, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
    });

    let profile = existing;
    if (!profile) {
      profile = await prisma.technicianProfile.create({
        data: {
          userId: req.user.id,
          status: 'PENDING',
          score: 5.0,
        },
      });
    }

    let techRegistrationInviteToken = null;
    let techRegistrationStatus = null;

    if (openApp) {
      techRegistrationInviteToken = openApp.inviteToken;
      techRegistrationStatus = openApp.status;
      await prisma.technicianRegistrationApplication
        .update({
          where: { id: openApp.id },
          data: { candidateUserId: req.user.id },
        })
        .catch(() => {});
    } else if (submittedApp) {
      techRegistrationStatus = 'SUBMITTED';
      techRegistrationInviteToken = null;
    } else {
      const token = generateTechRegInviteToken();
      const createdApp = await prisma.technicianRegistrationApplication.create({
        data: {
          tenantId,
          inviteToken: token,
          invitedEmail: em,
          status: 'INVITED',
          responsesJson: initialTechRegistrationResponsesJson(em),
          candidateUserId: req.user.id,
          createdByUserId: null,
        },
      });
      await prisma.technicianRegistrationEvent.create({
        data: {
          applicationId: createdApp.id,
          type: 'SELF_REQUESTED',
          message: 'Pedido iniciado no app (Quero ser prestador).',
          actorEmail: em,
        },
      });
      techRegistrationInviteToken = token;
      techRegistrationStatus = 'INVITED';
    }

    const statusCode = existing ? 200 : 201;
    res.status(statusCode).json({
      ...profile,
      techRegistrationInviteToken,
      techRegistrationStatus,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
