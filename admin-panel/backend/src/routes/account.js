'use strict';
const express = require('express');
const router = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../db');
const crypto  = require('crypto');
const path = require('path');
const { initialTechRegistrationResponsesJson } = require('../lib/techRegistrationDefaults');
const { sendExpoPushToMany } = require('../services/expoPush');
const { normalizeChatLocale, CANON_LOCALES } = require('../lib/chatTranslation');
const { isTechnicianIdentityLockedForUserId, TECH_IDENTITY_LOCKED_BODY } = require('../lib/technicianIdentityLock');
const { assertTechnicianSeatForNewUser } = require('../lib/planQuotaService');
const { verifyOAuthWithLaravel } = require('../lib/laravelInternalOAuthVerify');
const { buildEffectiveTenantBranding } = require('../lib/tenantBranding');
const { buildAppAuthorization } = require('../lib/authorization');
const { normalizeServiceCoverageGeo } = require('../lib/technicianServiceCoverage');
const { sendTransactionalEmailWithFallback } = require('../lib/transactionalEmailSend');
const {
  startChallenge,
  verifyChallenge,
  verifyRegisterOtpPhase1,
  completeRegisterFromSetupToken,
} = require('../lib/otpLoginService');
const { deliverBrsparkLaravelEvent, EVENT_TYPES } = require('../lib/brsparkSyncWebhook');
const { resolveVisionDetectionEngineLabelForApp } = require('../lib/visionDetectionRouting');
const { resolveAppDefaultTenantId } = require('../lib/appDefaultTenant');
const {
  validateAppPasswordPolicy,
  APP_PASSWORD_RULES_USER_FACING_PT,
} = require('../lib/appPasswordPolicy');
const { assertEmailFreeAcrossAllTenants } = require('../lib/appRegistrationEmailGuard');

function buildSafeTenantForApp(tenant) {
  if (!tenant) return null;
  /** Nome legal vs nome de exibição (painel): o app deve refletir o rebrand visível ao cliente. */
  const displayTenantName = String(tenant.ownerName || '').trim() || tenant.name;
  const branding = buildEffectiveTenantBranding({
    tenantName: displayTenantName,
    planFeatures: tenant.subscription?.plan?.features,
    tenantFeatures: tenant.features,
  });
  return {
    id: tenant.id,
    name: tenant.name,
    ownerName: tenant.ownerName,
    status: tenant.status,
    branding: branding.effective,
    /**
     * Placeholder; o valor efectivo (moondream vs yolo) vem de `buildSafeAppUserPayloadAsync`
     * com base em `tenant.features` e nas integrações globais na BD.
     */
    visionDetectionEngine: 'yolo',
  };
}

function buildSafeAppUserPayload(user) {
  const authz = buildAppAuthorization(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    preferredChatLocale: user.preferredChatLocale ?? null,
    employeeMatricula: user.employeeMatricula ?? null,
    addressJson: user.addressJson ?? null,
    tenantId: user.tenantId,
    tenant: buildSafeTenantForApp(user.tenant),
    technicianProfile: user.technicianProfile,
    appContext: {
      scope: authz.scope,
      contextTenantId: authz.contextTenantId,
      capabilities: authz.capabilities,
    },
  };
}

/**
 * Atualiza sessão de um utilizador do app, regista auditoria e devolve JWT + payload de /api/login.
 */
async function issueAppJwtAfterLogin(user, deviceId, auditResource) {
  const newSessionId = crypto.randomUUID();

  const prevDevice = user.currentDeviceId != null ? String(user.currentDeviceId) : '';
  const nextDevice = deviceId != null ? String(deviceId) : '';
  const shouldNotifyOtherDevice = user.currentSessionId && prevDevice !== nextDevice;
  if (shouldNotifyOtherDevice) {
    const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
    if (tokens.length > 0) {
      sendExpoPushToMany(tokens, {
        data: { type: 'FORCE_LOGOUT', reason: 'NEW_LOGIN' },
      }).catch((err) => console.error('[login_kickout]', err));
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLogin: new Date(),
      currentSessionId: newSessionId,
      currentDeviceId: deviceId || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      action: 'USER_LOGIN',
      resource: auditResource,
      category: 'AUTH',
    },
  });

  const fresh = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      tenant: { include: { subscription: { include: { plan: true } } } },
      technicianProfile: true,
    },
  });

  const token = jwt.sign(
    {
      id: fresh.id,
      tenantId: fresh.tenantId,
      email: fresh.email,
      role: fresh.role,
      sessionId: newSessionId,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );

  return {
    token,
    user: await buildSafeAppUserPayloadAsync(fresh),
  };
}

/**
 * Igual a `buildSafeAppUserPayload`, mas resolve `tenant.visionDetectionEngine` com a mesma
 * lógica que `/api/checklists/vision/analyze` (Moondream vs YOLO).
 */
async function buildSafeAppUserPayloadAsync(user) {
  const payload = buildSafeAppUserPayload(user);
  if (payload.tenant && user.tenant) {
    try {
      payload.tenant.visionDetectionEngine = await resolveVisionDetectionEngineLabelForApp(prisma, user.tenant.features);
    } catch (e) {
      console.warn('[account] visionDetectionEngine', e && e.message);
    }
  }
  return payload;
}

// /api/vision/* — biometria de campo / checklists (FaceMatch conforme plano). Gate IA do cadastro prestador: index.js → /api/ai-technician-profile-photo.
const visionRouter = require('./vision');
router.use('/vision', visionRouter);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function passwordResetTokenVersionFromHash(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 16);
}

function resolvePublicPanelBaseUrl(req) {
  const envBase = String(
    process.env.PUBLIC_PANEL_URL ||
      process.env.ADMIN_PANEL_PUBLIC_URL ||
      process.env.ADMIN_PANEL_PUBLIC_BASE_URL ||
      '',
  )
    .trim()
    .replace(/\/+$/, '');
  if (envBase) return envBase;
  const host = String(req?.get?.('host') || '').trim();
  if (!host) return null;
  return `${req.protocol || 'http'}://${host}`.replace(/\/+$/, '');
}

function buildPublicPasswordResetLink(req, token) {
  const base = resolvePublicPanelBaseUrl(req);
  if (!base) return null;
  return `${base}/api/password-reset?token=${encodeURIComponent(token)}`;
}

function issuePasswordResetToken(user) {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET não configurado no servidor.');
  }
  return jwt.sign(
    {
      purpose: 'PASSWORD_RESET',
      userId: user.id,
      tenantId: user.tenantId,
      version: passwordResetTokenVersionFromHash(user.password),
    },
    jwtSecret,
    { expiresIn: process.env.PASSWORD_RESET_EXPIRES_IN || '30m' },
  );
}

// ─── POST /api/register ─────────────────────────────────────────────────────
// Público — registro no app: tenant master BrSpark (slug brspark), papel USER; override opcional via env.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, deviceId } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    const pwReg = validateAppPasswordPolicy(password);
    if (!pwReg.ok) return res.status(400).json({ error: pwReg.error });

    const emailNorm = String(email).trim().toLowerCase();
    const hash = await bcrypt.hash(password, 10);
    const defaultTenantId = await resolveAppDefaultTenantId();
    if (!defaultTenantId) {
      return res.status(503).json({
        error:
          'Registo indisponível: não foi encontrada a tenant master BrSpark. Confirme o seed/migrações (slug brspark) ou contacte o suporte.',
      });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: defaultTenantId } });
    if (!tenant) {
      return res.status(500).json({
        error:
          'Configuração inválida: tenant do app não encontrada. Entre em contato com o suporte.',
      });
    }
    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Novos registros estão temporariamente indisponíveis.' });
    }

    const emailTaken = await assertEmailFreeAcrossAllTenants(prisma, emailNorm);
    if (emailTaken) {
      return res.status(409).json({ error: emailTaken, code: 'EMAIL_IN_USE' });
    }

    const seat = await assertTechnicianSeatForNewUser(prisma, defaultTenantId, 'USER');
    if (!seat.ok) {
      return res.status(403).json({ error: seat.error, code: seat.code || 'PLAN_MAX_TECHNICIANS' });
    }

    const user = await prisma.$transaction(async (tx) => {
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
    deliverBrsparkLaravelEvent({
      type: EVENT_TYPES.USER_CREATED,
      idempotencyKey: `user-${user.id}-register`,
      payload: { userId: user.id, tenantId: user.tenantId, email: user.email, source: 'password' },
    }).catch((e) => console.warn('[register] sync webhook', e));

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
          'Este e-mail está em mais de uma organização. Indique qual deseja acessar (tenantId) ou escolha na tela.',
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

    const { deviceId } = req.body;
    const out = await issueAppJwtAfterLogin(user, deviceId, emailNorm);
    res.json(out);
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/login/oauth ─────────────────────────────────────────────────
// Público — identidade validada no Laravel; emite JWT do Node (app móvel).
router.post('/login/oauth', async (req, res) => {
  try {
    const p = String(req.body.provider || '')
      .trim()
      .toLowerCase();
    if (!['google', 'facebook', 'apple'].includes(p)) {
      return res.status(400).json({ error: 'Provedor inválido.' });
    }

    const verified = await verifyOAuthWithLaravel({
      provider: p,
      idToken: req.body.idToken != null ? String(req.body.idToken) : undefined,
      accessToken: req.body.accessToken != null ? String(req.body.accessToken) : undefined,
    });

    if (!verified.ok) {
      if (verified.reason === 'not_configured') {
        return res.status(503).json({
          error:
            'Login social indisponível: configure CMS_DIRECTORY_BASE_URL e CMS_INTERNAL_API_TOKEN (Laravel).',
        });
      }
      const st = verified.status && verified.status >= 400 && verified.status < 600 ? verified.status : 502;
      const msg =
        (verified.body && (verified.body.message || verified.body.error)) ||
        'Não foi possível validar o token no servidor.';
      return res.status(st).json({ error: String(msg) });
    }

    const profile = verified.profile;
    const emailNorm = String(profile.email || '')
      .trim()
      .toLowerCase();
    if (!emailNorm) {
      return res.status(422).json({ error: 'E-mail não disponível neste login social.' });
    }

    const displayName =
      profile.name && String(profile.name).trim()
        ? String(profile.name).trim()
        : emailNorm.split('@')[0] || 'Utilizador';

    let candidates = await prisma.user.findMany({
      where: { email: emailNorm },
      include: { tenant: true, technicianProfile: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!candidates.length) {
      const defaultTenantId = await resolveAppDefaultTenantId();
      if (!defaultTenantId) {
        return res.status(503).json({
          error:
            'Conta social indisponível: não foi encontrada a tenant master BrSpark (slug brspark). Confirme o seed ou contacte o suporte.',
        });
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: defaultTenantId } });
      if (!tenant) {
        return res.status(500).json({
          error: 'Configuração inválida: tenant padrão do app não encontrado.',
        });
      }
      if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
        return res.status(403).json({ error: 'Novos registros estão temporariamente indisponíveis.' });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email_tenantId: { email: emailNorm, tenantId: defaultTenantId } },
      });
      if (existingUser) {
        candidates = await prisma.user.findMany({
          where: { email: emailNorm },
          include: { tenant: true, technicianProfile: true },
          orderBy: { createdAt: 'asc' },
        });
      } else {
        const seat = await assertTechnicianSeatForNewUser(prisma, defaultTenantId, 'USER');
        if (!seat.ok) {
          return res.status(403).json({ error: seat.error, code: seat.code || 'PLAN_MAX_TECHNICIANS' });
        }

        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              name: displayName,
              email: emailNorm,
              password: hash,
              tenantId: defaultTenantId,
              phone: null,
              role: 'USER',
            },
          });
          await tx.auditLog.create({
            data: {
              tenantId: defaultTenantId,
              userId: u.id,
              action: 'USER_REGISTER_OAUTH',
              resource: emailNorm,
              category: 'AUTH',
            },
          });
        });

        candidates = await prisma.user.findMany({
          where: { email: emailNorm },
          include: { tenant: true, technicianProfile: true },
          orderBy: { createdAt: 'asc' },
        });
      }
    }

    const tenantIdPick =
      req.body.tenantId != null && String(req.body.tenantId).trim() !== ''
        ? String(req.body.tenantId).trim()
        : null;

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
          'Este e-mail está em mais de uma organização. Indique qual deseja acessar (tenantId) ou escolha na tela.',
        tenants: candidates.map((u) => ({
          id: u.tenantId,
          name: u.tenant?.name || u.tenantId,
        })),
      });
    }

    if (!user.tenant) return res.status(401).json({ error: 'Conta inválida.' });

    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });
    }

    if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Conta suspensa ou cancelada.' });
    }

    const { deviceId } = req.body;
    const out = await issueAppJwtAfterLogin(user, deviceId, emailNorm);
    res.json(out);
  } catch (err) {
    console.error('[login/oauth]', err);
    res.status(500).json({ error: err.message });
  }
});

// Público — POST /api/password-reset/request
// Solicita envio do link de redefinição por e-mail.
router.post('/password-reset/request', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const tenantSlug = String(req.body?.tenantSlug || '')
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório.' });
    }

    let users = [];
    if (tenantSlug) {
      const tenant = await prisma.tenant.findFirst({
        where: { slug: { equals: tenantSlug, mode: 'insensitive' } },
        select: { id: true, name: true, status: true },
      });
      if (tenant && tenant.status !== 'SUSPENDED' && tenant.status !== 'CANCELLED') {
        const user = await prisma.user.findFirst({
          where: { email, tenantId: tenant.id, isActive: true },
          include: { tenant: true },
        });
        if (user) users = [user];
      }
    } else {
      users = await prisma.user.findMany({
        where: {
          email,
          isActive: true,
          tenant: { is: { status: { notIn: ['SUSPENDED', 'CANCELLED'] } } },
        },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
        take: 5,
      });
    }

    if (!users.length) {
      return res.json({
        ok: true,
        message:
          'Se existir uma conta com esse e-mail, você receberá um link para redefinir a senha em instantes.',
      });
    }

    const results = await Promise.all(
      users.map(async (user) => {
        const resetToken = issuePasswordResetToken(user);
        const resetLink = buildPublicPasswordResetLink(req, resetToken);
        if (!resetLink) {
          return {
            ok: false,
            skipped: true,
            error: 'Não foi possível gerar o link público de redefinição.',
          };
        }

        const tenantName = String(user.tenant?.name || 'BrSpark').trim();
        const subject =
          users.length > 1
            ? `BrSpark: redefina sua senha (${tenantName})`
            : 'BrSpark: redefina sua senha';

        const text =
          `Olá, ${user.name || 'usuário'}!\n\n` +
          `Recebemos uma solicitação para redefinir a senha da sua conta BrSpark${tenantName ? ` em ${tenantName}` : ''}.\n\n` +
          `Use este link para criar uma nova senha:\n${resetLink}\n\n` +
          `${APP_PASSWORD_RULES_USER_FACING_PT}\n\n` +
          `Este link expira em ${process.env.PASSWORD_RESET_EXPIRES_IN || '30 minutos'}.\n` +
          `Se você não pediu a redefinição, pode ignorar este e-mail.\n`;

        const html =
          `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">` +
          `<h2 style="margin:0 0 12px">Redefinição de senha</h2>` +
          `<p>Olá, <strong>${escapeHtml(user.name || 'usuário')}</strong>.</p>` +
          `<p>Recebemos uma solicitação para redefinir a senha da sua conta BrSpark${tenantName ? ` em <strong>${escapeHtml(tenantName)}</strong>` : ''}.</p>` +
          `<p style="margin:0 0 16px;font-size:14px;color:#334155">${escapeHtml(APP_PASSWORD_RULES_USER_FACING_PT)}</p>` +
          `<p style="margin:24px 0">` +
          `<a href="${escapeHtml(resetLink)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Criar nova senha</a>` +
          `</p>` +
          `<p>Se preferir, copie e cole este link no navegador:</p>` +
          `<p><a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a></p>` +
          `<p>Este link expira em ${escapeHtml(process.env.PASSWORD_RESET_EXPIRES_IN || '30 minutos')}.</p>` +
          `<p>Se você não pediu a redefinição, pode ignorar este e-mail.</p>` +
          `</div>`;

        const { send, provider } = await sendTransactionalEmailWithFallback({
          to: { email: user.email, name: user.name || undefined },
          subject,
          text,
          html,
        });

        if (send.ok) {
          await prisma.auditLog
            .create({
              data: {
                tenantId: user.tenantId,
                userId: user.id,
                action: 'USER_PASSWORD_RESET_REQUESTED',
                resource: user.email,
                category: 'AUTH',
              },
            })
            .catch(() => {});
        }

        return { ok: !!send.ok, provider, skipped: !!send.skipped, error: send.error || null };
      }),
    );

    if (!results.some((result) => result.ok)) {
      const unavailable = results.every((result) => result.skipped);
      return res.status(unavailable ? 503 : 502).json({
        error: unavailable
          ? 'A recuperação de senha está indisponível no momento. Tente novamente mais tarde.'
          : 'Não foi possível enviar o e-mail de redefinição agora. Tente novamente em instantes.',
      });
    }

    res.json({
      ok: true,
      message:
        'Se existir uma conta com esse e-mail, você receberá um link para redefinir a senha em instantes.',
    });
  } catch (err) {
    console.error('[password-reset/request]', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

// Público — GET /api/password-reset?token=...
// Entrega a página HTML de redefinição mesmo em deploys que só expõem /api/*.
router.get('/password-reset', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../../reset-password.html'));
});

// Público — POST /api/password-reset/confirm
// Confirma a redefinição usando token temporário recebido por e-mail.
router.post('/password-reset/confirm', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token) {
      return res.status(400).json({ error: 'Token de redefinição é obrigatório.' });
    }
    const pwReset = validateAppPasswordPolicy(newPassword);
    if (!pwReset.ok) {
      return res.status(400).json({ error: pwReset.error });
    }

    const jwtSecret = String(process.env.JWT_SECRET || '').trim();
    if (!jwtSecret) {
      return res.status(500).json({ error: 'JWT_SECRET não configurado no servidor.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch (err) {
      const expired = err && err.name === 'TokenExpiredError';
      return res.status(400).json({
        error: expired
          ? 'O link de redefinição expirou. Solicite um novo e-mail.'
          : 'Link de redefinição inválido.',
      });
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.purpose !== 'PASSWORD_RESET' ||
      !payload.userId
    ) {
      return res.status(400).json({ error: 'Link de redefinição inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: String(payload.userId) },
      include: { tenant: true },
    });
    if (!user) {
      return res.status(400).json({ error: 'Link de redefinição inválido.' });
    }
    if (payload.version !== passwordResetTokenVersionFromHash(user.password)) {
      return res.status(400).json({ error: 'Este link de redefinição já foi usado ou ficou inválido.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
    }
    if (user.tenant?.status === 'SUSPENDED' || user.tenant?.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Esta conta está suspensa ou cancelada.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        currentSessionId: null,
        currentDeviceId: null,
      },
    });

    const tokens = await prisma.pushToken.findMany({ where: { userId: user.id } });
    if (tokens.length > 0) {
      sendExpoPushToMany(tokens, {
        data: { type: 'FORCE_LOGOUT', reason: 'PASSWORD_RESET' },
      }).catch((err) => console.error('[password_reset_kickout]', err));
    }

    await prisma.auditLog
      .create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'USER_PASSWORD_RESET_COMPLETED',
          resource: user.email,
          category: 'AUTH',
        },
      })
      .catch(() => {});

    res.json({
      ok: true,
      message: 'Senha redefinida com sucesso. Faça login novamente com a nova senha.',
    });
  } catch (err) {
    console.error('[password-reset/confirm]', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

// ─── GET /api/me ─────────────────────────────────────────────────────────────
// Autenticado — retorna perfil do usuário logado (para o app)
const authUser = require('../middleware/authUser');
const { handleTechnicianProfilePhotoAiValidate } = require('../lib/handleTechnicianProfilePhotoAiValidate');
const {
  configured: cmsDirectoryHeroConfigured,
  getDirectoryHero,
  putDirectoryHero,
} = require('../lib/cmsInternalDirectoryHero');

function requireTenantDirectoryManager(req, res, next) {
  const r = req.user.role;
  if (r !== 'TENANT_ADMIN' && r !== 'MANAGER') {
    return res.status(403).json({
      error:
        'Apenas administrador ou gestor da organização pode gerir o banner do diretório público.',
    });
  }
  next();
}
// ─── GET /api/me/directory-hero ───────────────────────────────────────────────
// Banner público (diretório CMS) — pré-visualização no app; mesmo e-mail que o painel web.
router.get('/me/directory-hero', authUser, requireTenantDirectoryManager, async (req, res) => {
  try {
    const email = String(req.user.email || '')
      .trim()
      .toLowerCase();
    if (!email) return res.status(400).json({ error: 'E-mail do usuário ausente.' });

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user.tenantId },
      select: { name: true },
    });

    if (!cmsDirectoryHeroConfigured()) {
      return res.json({
        skipped: true,
        linked: false,
        hero_image_url: null,
        logo_url: null,
        company_name: tenant?.name || null,
        hint:
          'O servidor não está ligado ao diretório web (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
      });
    }

    const result = await getDirectoryHero(email);
    if (!result.ok) {
      if (result.reason === 'not_configured') {
        return res.json({
          skipped: true,
          linked: false,
          hero_image_url: null,
          logo_url: null,
          company_name: tenant?.name || null,
          hint:
            'O servidor não está ligado ao diretório web (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
        });
      }
      if (result.status === 404 && result.body?.code === 'CMS_USER_NOT_FOUND') {
        return res.json({
          skipped: false,
          linked: false,
          hero_image_url: null,
          logo_url: null,
          company_name: tenant?.name || null,
          hint:
            'Não encontramos conta do painel web com este e-mail. Use o mesmo e-mail da empresa no portal BrSpark para sincronizar o banner.',
        });
      }
      return res.status(result.status >= 400 ? result.status : 502).json({
        error: result.body?.message || 'Falha ao consultar o CMS.',
        code: result.body?.code,
      });
    }

    res.json({
      skipped: false,
      linked: true,
      hero_image_url: result.data.hero_image_url ?? null,
      logo_url: result.data.logo_url ?? null,
      company_name: result.data.company_name || tenant?.name || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/me/directory-hero ───────────────────────────────────────────────
router.put('/me/directory-hero', authUser, requireTenantDirectoryManager, async (req, res) => {
  try {
    const email = String(req.user.email || '')
      .trim()
      .toLowerCase();
    if (!email) return res.status(400).json({ error: 'E-mail do usuário ausente.' });

    const raw = req.body?.heroImageUrl;
    const heroImageUrl =
      raw === undefined || raw === null || String(raw).trim() === '' ? null : String(raw).trim();

    if (!cmsDirectoryHeroConfigured()) {
      return res.status(503).json({
        error:
          'Integração com o diretório web não configurada (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
      });
    }

    const result = await putDirectoryHero(email, heroImageUrl);
    if (!result.ok) {
      if (result.reason === 'not_configured') {
        return res.status(503).json({
          error:
            'Integração com o diretório web não configurada (CMS_DIRECTORY_BASE_URL / CMS_INTERNAL_API_TOKEN).',
        });
      }
      if (result.status === 404 && result.body?.code === 'CMS_USER_NOT_FOUND') {
        return res.status(409).json({
          error:
            'Não encontramos conta do painel web com este e-mail. Cadastre a empresa no portal BrSpark com o mesmo e-mail ou contacte o suporte.',
          code: 'CMS_USER_NOT_FOUND',
        });
      }
      return res.status(result.status >= 400 ? result.status : 502).json({
        error: result.body?.message || 'Falha ao atualizar o CMS.',
        code: result.body?.code,
      });
    }

    res.json({
      hero_image_url: result.data.hero_image_url ?? null,
      company_name: result.data.company_name ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authUser, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        tenant: { include: { subscription: { include: { plan: true } } } },
        technicianProfile: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(await buildSafeAppUserPayloadAsync(user));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * DELETE /api/me — exclusão de conta (LGPD): anonimiza dados de identificação, invalida sessão,
 * remove tokens push e desativa o utilizador (paridade com Laravel `AuthController::deleteAccount`).
 */
router.delete('/me', authUser, async (req, res) => {
  const userId = String(req.user.id || '').trim();
  if (!userId) return res.status(400).json({ error: 'Sessão inválida.' });

  const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
  const tombstoneEmail = `deleted_${userId}@brspark.com`;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Usuário Excluído',
          email: tombstoneEmail,
          password: randomPassword,
          phone: null,
          avatarUrl: null,
          addressJson: null,
          personalDocuments: null,
          faceEnrollmentPhotos: null,
          comprefaceRecognitionSync: null,
          employeeMatricula: null,
          preferredChatLocale: null,
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
          emailVerifiedAt: null,
          currentSessionId: null,
          currentDeviceId: null,
          isActive: false,
        },
      });
    });

    res.json({
      message: 'Conta excluída e dados anonimizados com sucesso.',
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : 'Erro ao excluir conta.';
    if (msg.includes('Unique constraint') || msg.includes('P2002')) {
      return res.status(409).json({
        error: 'Não foi possível concluir a exclusão agora. Contacte o suporte.',
      });
    }
    console.error('[account] DELETE /me', err);
    res.status(500).json({ error: msg });
  }
});

// ─── PUT /api/me ─────────────────────────────────────────────────────────────
// Autenticado — atualiza perfil do usuário logado
router.put('/me', authUser, async (req, res) => {
  try {
    const { name, email, avatarUrl, preferredChatLocale, addressJson, technicianCoverageGeoJson } = req.body;

    if (avatarUrl !== undefined && (await isTechnicianIdentityLockedForUserId(req.user.id))) {
      return res.status(403).json(TECH_IDENTITY_LOCKED_BODY);
    }

    let localeUpdate = undefined;
    if (preferredChatLocale !== undefined) {
      if (preferredChatLocale === null || String(preferredChatLocale).trim() === '') {
        localeUpdate = null;
      } else {
        const n = normalizeChatLocale(preferredChatLocale);
        if (!CANON_LOCALES.includes(n)) {
          return res.status(400).json({
            error: `Idioma inválido. Use: ${CANON_LOCALES.join(', ')} ou deixe vazio para automático.`,
          });
        }
        localeUpdate = n;
      }
    }

    let normalizedCoverage = undefined;
    if (technicianCoverageGeoJson !== undefined) {
      normalizedCoverage = normalizeServiceCoverageGeo(technicianCoverageGeoJson);
      if (technicianCoverageGeoJson !== null && !normalizedCoverage) {
        return res.status(400).json({
          error: 'Área de atendimento inválida. Informe coordenadas válidas e um raio entre 1 e 500 km.',
        });
      }
    }

    const profile = await prisma.technicianProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (technicianCoverageGeoJson !== undefined && !profile) {
      return res.status(400).json({
        error: 'Só contas com perfil técnico podem salvar área de atendimento.',
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: req.user.id },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(avatarUrl !== undefined && { avatarUrl }),
          ...(localeUpdate !== undefined && { preferredChatLocale: localeUpdate }),
          ...(addressJson !== undefined && { addressJson }),
        },
      });
      if (profile && technicianCoverageGeoJson !== undefined) {
        await tx.technicianProfile.update({
          where: { userId: req.user.id },
          data: {
            serviceCoverageGeoJson: normalizedCoverage,
          },
        });
      }
      return nextUser;
    });

    const fresh = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        tenant: { include: { subscription: { include: { plan: true } } } },
        technicianProfile: true,
      },
    });
    const { password: _, ...safe } = updated;
    res.json(fresh ? await buildSafeAppUserPayloadAsync(fresh) : safe);
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

// Público — POST /api/otp-auth/start — inicia desafio OTP (e-mail; telefone apenas com ALLOW_OTP_PLAINTEXT em dev)
router.post('/otp-auth/start', express.json(), async (req, res) => {
  try {
    const out = await startChallenge(prisma, {
      identifier: req.body?.identifier,
      channelPref: req.body?.channel,
      purpose: req.body?.purpose,
      nameIfRegister: req.body?.name,
      registerPhone: req.body?.phone,
      resolveAppDefaultTenantId,
    });
    if (!out.ok) {
      return res.status(out.status || 400).json({ error: out.error });
    }
    /** Diagnóstico: clientes antigos devolviam 409 «e-mail já existe» aqui; v2 já não bloqueia e-mail activo no envio do OTP. */
    if (String(req.body?.purpose || '').toLowerCase() === 'register') {
      res.setHeader('X-Brspark-Register-Start-Policy', 'v2-no-email-block-at-send');
    }
    return res.json({
      challengeId: out.challengeId,
      channel: out.channel,
      expiresInSec: out.expiresInSec,
      devCode: out.devCode,
    });
  } catch (err) {
    console.error('[POST /otp-auth/start]', err);
    return res.status(500).json({ error: err?.message || 'Erro interno' });
  }
});

// Público — POST /api/otp-auth/verify
router.post('/otp-auth/verify', express.json(), async (req, res) => {
  try {
    const out = await verifyChallenge(
      prisma,
      { assertTechnicianSeatForNewUser, resolveAppDefaultTenantId, issueAppJwtAfterLogin },
      {
        challengeId: req.body?.challengeId,
        code: req.body?.code,
        deviceId: req.body?.deviceId,
        registerName: req.body?.name,
      }
    );
    if (!out.ok) {
      const body = { error: out.error, code: out.code, attemptsLeft: out.attemptsLeft };
      return res.status(out.status || 400).json(body);
    }
    return res.json({ token: out.token, user: out.user });
  } catch (err) {
    console.error('[POST /otp-auth/verify]', err);
    return res.status(500).json({ error: err?.message || 'Erro interno' });
  }
});

/** Registo em 3 passos: após OTP válido, devolve token para definir senha (sem sessão ainda). */
router.post('/otp-auth/register-verify-otp', express.json(), async (req, res) => {
  try {
    const out = await verifyRegisterOtpPhase1(prisma, { resolveAppDefaultTenantId }, {
      challengeId: req.body?.challengeId,
      code: req.body?.code,
      registerName: req.body?.name,
    });
    if (!out.ok) {
      return res.status(out.status || 400).json({ error: out.error, code: out.code, attemptsLeft: out.attemptsLeft });
    }
    return res.json({ setupToken: out.setupToken });
  } catch (err) {
    console.error('[POST /otp-auth/register-verify-otp]', err);
    return res.status(500).json({ error: err?.message || 'Erro interno' });
  }
});

/** Finaliza registo com senha + consentimento (após `register-verify-otp`). */
router.post('/otp-auth/register-complete', express.json(), async (req, res) => {
  try {
    const out = await completeRegisterFromSetupToken(
      prisma,
      { assertTechnicianSeatForNewUser, resolveAppDefaultTenantId, issueAppJwtAfterLogin },
      {
        setupToken: req.body?.setupToken,
        password: req.body?.password,
        consent: req.body?.consent,
        deviceId: req.body?.deviceId,
      },
    );
    if (!out.ok) {
      return res.status(out.status || 400).json({ error: out.error, code: out.code });
    }
    return res.status(201).json({ token: out.token, user: out.user });
  } catch (err) {
    console.error('[POST /otp-auth/register-complete]', err);
    return res.status(500).json({ error: err?.message || 'Erro interno' });
  }
});

// Público — POST /api/verify-email — confirma e-mail com token (48 h) gerado pelo painel
router.post('/verify-email', express.json(), async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token || token.length < 32) {
      return res.status(400).json({ error: 'Token inválido.' });
    }
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });
    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou já utilizado.' });
    }
    const exp = user.emailVerificationExpiresAt;
    if (!exp || new Date(exp).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Link expirado. Solicite um novo e-mail no painel.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          action: 'USER_EMAIL_VERIFIED',
          resource: user.email,
          category: 'AUTH',
        },
      });
    });

    res.json({ ok: true, message: 'E-mail confirmado.' });
  } catch (err) {
    console.error('POST /verify-email', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
