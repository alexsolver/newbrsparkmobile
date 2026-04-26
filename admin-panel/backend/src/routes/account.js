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
const { normalizeWorkScheduleJson } = require('../lib/technicianWorkScheduleNormalize');
const { sendTransactionalEmailWithFallback } = require('../lib/transactionalEmailSend');
const {
  startChallenge,
  verifyChallenge,
  verifyRegisterOtpPhase1,
  completeRegisterFromSetupToken,
  startEmailPurposeChallenge,
} = require('../lib/otpLoginService');
const { deliverBrsparkLaravelEvent, EVENT_TYPES } = require('../lib/brsparkSyncWebhook');
const { resolveVisionDetectionEngineLabelForApp } = require('../lib/visionDetectionRouting');
const { createPersonalClientTenantAndUserInTransaction } = require('../lib/registerPersonalClientTenant');
const {
  ensureMembershipRoleMatchesTenantKind,
  verifyAppLoginPasswordAndEnsureAccount,
  setUnifiedPasswordHashForEmail,
  resolvePasswordHashForResetVersion,
} = require('../lib/appAccountAuth');
const {
  validateAppPasswordPolicy,
  APP_PASSWORD_RULES_USER_FACING_PT,
} = require('../lib/appPasswordPolicy');
const { assertEmailFreeAcrossAllTenants } = require('../lib/appRegistrationEmailGuard');
const {
  ensureHttpsUrlForPublicInternet,
  isPrivateOrLocalHost,
} = require('../lib/publicHttpsUrl');
const { selectUserForMultiAccountLogin } = require('../lib/multiAccountLoginPick');

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
    kind: tenant.kind || 'COMPANY',
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
    avatarUrl: ensureHttpsUrlForPublicInternet(user.avatarUrl),
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

  await ensureMembershipRoleMatchesTenantKind(prisma, user.id);

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
  if (envBase) return ensureHttpsUrlForPublicInternet(envBase);
  const host = String(req?.get?.('host') || '').trim();
  if (!host) return null;
  const hostOnly = host.split(':')[0] || '';
  const hdr = req?.headers?.['x-forwarded-proto'] || req?.headers?.['X-Forwarded-Proto'];
  const xf = String(hdr || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  let proto =
    xf === 'https' ? 'https' : xf === 'http' ? 'http' : String(req?.protocol || 'http').toLowerCase();
  if (proto === 'http' && hostOnly && !isPrivateOrLocalHost(hostOnly)) {
    proto = 'https';
  }
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function buildPublicPasswordResetLink(req, token) {
  const base = resolvePublicPanelBaseUrl(req);
  if (!base) return null;
  return `${base}/api/password-reset?token=${encodeURIComponent(token)}`;
}

async function issuePasswordResetTokenForUser(user) {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET não configurado no servidor.');
  }
  const versionHash = await resolvePasswordHashForResetVersion(prisma, user);
  return jwt.sign(
    {
      purpose: 'PASSWORD_RESET',
      userId: user.id,
      tenantId: user.tenantId,
      version: passwordResetTokenVersionFromHash(versionHash),
    },
    jwtSecret,
    { expiresIn: process.env.PASSWORD_RESET_EXPIRES_IN || '30m' },
  );
}

function issuePasswordResetTokenForAppAccount(account) {
  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    throw new Error('JWT_SECRET não configurado no servidor.');
  }
  return jwt.sign(
    {
      purpose: 'PASSWORD_RESET_ACCOUNT',
      accountId: account.id,
      version: passwordResetTokenVersionFromHash(account.password),
    },
    jwtSecret,
    { expiresIn: process.env.PASSWORD_RESET_EXPIRES_IN || '30m' },
  );
}

// ─── POST /api/register ─────────────────────────────────────────────────────
// Público — registo no app: cria tenant CLIENT pessoal e utilizador USER (não usa a tenant master).
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, deviceId } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    const pwReg = validateAppPasswordPolicy(password);
    if (!pwReg.ok) return res.status(400).json({ error: pwReg.error });

    const emailNorm = String(email).trim().toLowerCase();
    const hash = await bcrypt.hash(password, 10);
    const phoneTrim = phone != null && String(phone).trim() ? String(phone).trim() : null;

    const emailTaken = await assertEmailFreeAcrossAllTenants(prisma, emailNorm);
    if (emailTaken) {
      return res.status(409).json({ error: emailTaken, code: 'EMAIL_IN_USE' });
    }

    if (phoneTrim) {
      const phoneBusy = await prisma.user.findFirst({
        where: { phone: phoneTrim, isActive: true },
        select: { id: true },
      });
      if (phoneBusy) {
        return res.status(409).json({
          error: 'Este telefone já está associado a uma conta.',
          code: 'PHONE_IN_USE',
        });
      }
    }

    let user;
    try {
      const out = await prisma.$transaction(async (tx) => {
        const acc = await tx.appAccount.create({
          data: { emailNorm, password: hash },
        });
        return createPersonalClientTenantAndUserInTransaction(tx, {
          name: String(name).trim(),
          emailNorm,
          passwordHash: hash,
          phone: phoneTrim,
          phoneVerifiedAt: null,
          auditAction: 'USER_REGISTER',
          auditResource: emailNorm,
          appAccountId: acc.id,
        });
      });
      user = out.user;
    } catch (e) {
      const code = e && e.code;
      if (code === 'PLAN_MAX_TECHNICIANS') {
        return res.status(403).json({ error: e.message || 'Limite do plano.', code: code || 'PLAN_MAX_TECHNICIANS' });
      }
      throw e;
    }
    // Recarrega com tenant / technicianProfile para enviar contexto ao Laravel.
    const hydrated = await prisma.user.findUnique({
      where: { id: user.id },
      include: { tenant: true, technicianProfile: true },
    });
    const roleHint = hydrated?.technicianProfile ? 'TECHNICIAN' : hydrated?.role;
    deliverBrsparkLaravelEvent({
      type: EVENT_TYPES.USER_CREATED,
      idempotencyKey: `user-${user.id}-register`,
      payload: {
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        userName: hydrated?.name || user.name,
        role: roleHint || user.role,
        tenantName: hydrated?.tenant?.name || out?.tenant?.name || undefined,
        source: 'password',
      },
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
      user = await selectUserForMultiAccountLogin(prisma, candidates);
      if (!user) {
        return res.status(500).json({ error: 'Não foi possível escolher a organização para este e-mail.' });
      }
    }

    if (!user.tenant) return res.status(401).json({ error: 'Credenciais inválidas.' });

    if (!user.isActive)
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });

    if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED')
      return res.status(403).json({ error: 'Conta suspensa ou cancelada.' });

    const authPw = await verifyAppLoginPasswordAndEnsureAccount(prisma, emailNorm, password);
    if (!authPw.ok) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const { deviceId } = req.body;

    const u2fa = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });
    if (u2fa?.twoFactorEnabled) {
      const ch = await startEmailPurposeChallenge(prisma, {
        emailNorm: user.email,
        purpose: 'two_factor_login',
        metadataJson: { userId: user.id, deviceId: deviceId != null ? deviceId : null },
      });
      if (!ch.ok) {
        return res.status(ch.status || 503).json({ error: ch.error || 'Não foi possível enviar o código por e-mail.' });
      }
      return res.json({ requiresTwoFactor: true, challengeToken: ch.challengeId });
    }

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
      const emailTakenOAuth = await assertEmailFreeAcrossAllTenants(prisma, emailNorm);
      if (emailTakenOAuth) {
        candidates = await prisma.user.findMany({
          where: { email: emailNorm },
          include: { tenant: true, technicianProfile: true },
          orderBy: { createdAt: 'asc' },
        });
        if (!candidates.length) {
          return res.status(409).json({ error: emailTakenOAuth, code: 'EMAIL_IN_USE' });
        }
      } else {
        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        try {
          const { user: createdOAuth } = await prisma.$transaction(async (tx) => {
            const acc = await tx.appAccount.create({
              data: { emailNorm, password: hash },
            });
            return createPersonalClientTenantAndUserInTransaction(tx, {
              name: displayName,
              emailNorm,
              passwordHash: hash,
              phone: null,
              phoneVerifiedAt: null,
              auditAction: 'USER_REGISTER_OAUTH',
              auditResource: emailNorm,
              appAccountId: acc.id,
            });
          });
          deliverBrsparkLaravelEvent({
            type: EVENT_TYPES.USER_CREATED,
            idempotencyKey: `user-${createdOAuth.id}-oauth`,
            payload: {
              userId: createdOAuth.id,
              tenantId: createdOAuth.tenantId,
              email: createdOAuth.email,
              source: 'oauth',
            },
          }).catch((e) => console.warn('[login/oauth] sync webhook', e));
        } catch (e) {
          const code = e && e.code;
          if (code === 'PLAN_MAX_TECHNICIANS') {
            return res.status(403).json({ error: e.message || 'Limite do plano.', code: code || 'PLAN_MAX_TECHNICIANS' });
          }
          throw e;
        }

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
      user = await selectUserForMultiAccountLogin(prisma, candidates);
      if (!user) {
        return res.status(500).json({ error: 'Não foi possível escolher a organização para este e-mail.' });
      }
    }

    if (!user.tenant) return res.status(401).json({ error: 'Conta inválida.' });

    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta suspensa. Entre em contato com o suporte.' });
    }

    if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Conta suspensa ou cancelada.' });
    }

    const { deviceId } = req.body;

    const u2faOauth = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });
    if (u2faOauth?.twoFactorEnabled) {
      const ch = await startEmailPurposeChallenge(prisma, {
        emailNorm: user.email,
        purpose: 'two_factor_login',
        metadataJson: { userId: user.id, deviceId: deviceId != null ? deviceId : null },
      });
      if (!ch.ok) {
        return res.status(ch.status || 503).json({ error: ch.error || 'Não foi possível enviar o código por e-mail.' });
      }
      return res.json({ requiresTwoFactor: true, challengeToken: ch.challengeId });
    }

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

    const appAccount =
      !tenantSlug && users.length
        ? await prisma.appAccount.findUnique({ where: { emailNorm: email } })
        : null;

    if (appAccount && !tenantSlug) {
      const resetToken = issuePasswordResetTokenForAppAccount(appAccount);
      const resetLink = buildPublicPasswordResetLink(req, resetToken);
      if (!resetLink) {
        return res.status(503).json({
          error: 'Não foi possível gerar o link público de redefinição.',
        });
      }
      const greet = String(users[0].name || 'usuário').trim();
      const subject = 'BrSpark: redefina sua senha';
      const text =
        `Olá, ${greet}!\n\n` +
        `Recebemos uma solicitação para redefinir a senha da sua conta BrSpark (todas as organizações associadas a este e-mail).\n\n` +
        `Use este link para criar uma nova senha:\n${resetLink}\n\n` +
        `${APP_PASSWORD_RULES_USER_FACING_PT}\n\n` +
        `Este link expira em ${process.env.PASSWORD_RESET_EXPIRES_IN || '30 minutos'}.\n` +
        `Se você não pediu a redefinição, pode ignorar este e-mail.\n`;
      const html =
        `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">` +
        `<h2 style="margin:0 0 12px">Redefinição de senha</h2>` +
        `<p>Olá, <strong>${escapeHtml(greet)}</strong>.</p>` +
        `<p>Recebemos uma solicitação para redefinir a senha da sua conta BrSpark (todas as organizações associadas a este e-mail).</p>` +
        `<p style="margin:0 0 16px;font-size:14px;color:#334155">${escapeHtml(APP_PASSWORD_RULES_USER_FACING_PT)}</p>` +
        `<p style="margin:24px 0">` +
        `<a href="${escapeHtml(resetLink)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Criar nova senha</a>` +
        `</p>` +
        `<p>Se preferir, copie e cole este link no navegador:</p>` +
        `<p><a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a></p>` +
        `<p>Este link expira em ${escapeHtml(process.env.PASSWORD_RESET_EXPIRES_IN || '30 minutos')}.</p>` +
        `<p>Se você não pediu a redefinição, pode ignorar este e-mail.</p>` +
        `</div>`;
      const { send } = await sendTransactionalEmailWithFallback({
        to: { email, name: greet !== 'usuário' ? greet : undefined },
        subject,
        text,
        html,
      });
      if (send.ok) {
        await prisma.auditLog
          .create({
            data: {
              tenantId: users[0].tenantId,
              userId: users[0].id,
              action: 'USER_PASSWORD_RESET_REQUESTED',
              resource: email,
              category: 'AUTH',
              metadata: { unifiedAccount: true },
            },
          })
          .catch(() => {});
      }
      if (!send.ok) {
        return res.status(send.skipped ? 503 : 502).json({
          error: send.skipped
            ? 'A recuperação de senha está indisponível no momento. Tente novamente mais tarde.'
            : 'Não foi possível enviar o e-mail de redefinição agora. Tente novamente em instantes.',
        });
      }
      return res.json({
        ok: true,
        message:
          'Se existir uma conta com esse e-mail, você receberá um link para redefinir a senha em instantes.',
      });
    }

    const results = await Promise.all(
      users.map(async (user) => {
        const resetToken = await issuePasswordResetTokenForUser({
          id: user.id,
          tenantId: user.tenantId,
          password: user.password,
          appAccountId: user.appAccountId,
        });
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

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Link de redefinição inválido.' });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    if (payload.purpose === 'PASSWORD_RESET_ACCOUNT' && payload.accountId) {
      const acc = await prisma.appAccount.findUnique({
        where: { id: String(payload.accountId) },
      });
      if (!acc) {
        return res.status(400).json({ error: 'Link de redefinição inválido.' });
      }
      if (payload.version !== passwordResetTokenVersionFromHash(acc.password)) {
        return res.status(400).json({ error: 'Este link de redefinição já foi usado ou ficou inválido.' });
      }
      await setUnifiedPasswordHashForEmail(prisma, acc.emailNorm, hash);
      const affected = await prisma.user.findMany({
        where: { appAccountId: acc.id, isActive: true },
        select: { id: true, tenantId: true },
      });
      await prisma.user.updateMany({
        where: { appAccountId: acc.id },
        data: { currentSessionId: null, currentDeviceId: null },
      });
      for (const row of affected) {
        const tokens = await prisma.pushToken.findMany({ where: { userId: row.id } });
        if (tokens.length > 0) {
          sendExpoPushToMany(tokens, {
            data: { type: 'FORCE_LOGOUT', reason: 'PASSWORD_RESET' },
          }).catch((err) => console.error('[password_reset_kickout]', err));
        }
        await prisma.auditLog
          .create({
            data: {
              tenantId: row.tenantId,
              userId: row.id,
              action: 'USER_PASSWORD_RESET_COMPLETED',
              resource: acc.emailNorm,
              category: 'AUTH',
              metadata: { unifiedAccount: true },
            },
          })
          .catch(() => {});
      }
      return res.json({
        ok: true,
        message: 'Senha redefinida com sucesso. Faça login novamente com a nova senha.',
      });
    }

    if (payload.purpose !== 'PASSWORD_RESET' || !payload.userId) {
      return res.status(400).json({ error: 'Link de redefinição inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: String(payload.userId) },
      include: { tenant: true },
    });
    if (!user) {
      return res.status(400).json({ error: 'Link de redefinição inválido.' });
    }
    const versionHash = await resolvePasswordHashForResetVersion(prisma, user);
    if (payload.version !== passwordResetTokenVersionFromHash(versionHash)) {
      return res.status(400).json({ error: 'Este link de redefinição já foi usado ou ficou inválido.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
    }
    if (user.tenant?.status === 'SUSPENDED' || user.tenant?.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Esta conta está suspensa ou cancelada.' });
    }

    await setUnifiedPasswordHashForEmail(prisma, String(user.email || '').trim().toLowerCase(), hash);
    await prisma.user.updateMany({
      where: { email: String(user.email || '').trim().toLowerCase() },
      data: { currentSessionId: null, currentDeviceId: null },
    });
    const sameEmailUsers = await prisma.user.findMany({
      where: { email: String(user.email || '').trim().toLowerCase(), isActive: true },
      select: { id: true, tenantId: true },
    });
    for (const row of sameEmailUsers) {
      const tokens = await prisma.pushToken.findMany({ where: { userId: row.id } });
      if (tokens.length > 0) {
        sendExpoPushToMany(tokens, {
          data: { type: 'FORCE_LOGOUT', reason: 'PASSWORD_RESET' },
        }).catch((err) => console.error('[password_reset_kickout]', err));
      }
      await prisma.auditLog
        .create({
          data: {
            tenantId: row.tenantId,
            userId: row.id,
            action: 'USER_PASSWORD_RESET_COMPLETED',
            resource: user.email,
            category: 'AUTH',
          },
        })
        .catch(() => {});
    }

    res.json({
      ok: true,
      message: 'Senha redefinida com sucesso. Faça login novamente com a nova senha.',
    });
  } catch (err) {
    console.error('[password-reset/confirm]', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

// ─── POST /api/2fa/verify — concluir login após OTP (público) ─────────────────
router.post('/2fa/verify', async (req, res) => {
  try {
    const challengeToken = String(req.body?.challengeToken || '').trim();
    const otp = String(req.body?.otp || '').trim();
    if (!challengeToken || !otp) {
      return res.status(400).json({ error: 'challengeToken e otp são obrigatórios.' });
    }
    const ch = await prisma.otpLoginChallenge.findUnique({ where: { id: challengeToken } });
    if (!ch || ch.consumedAt || String(ch.purpose) !== 'two_factor_login') {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }
    if (new Date(ch.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Código expirado. Inicie sessão novamente.' });
    }
    if (ch.attempts >= ch.maxAttempts) {
      return res.status(400).json({ error: 'Muitas tentativas. Inicie sessão novamente.' });
    }
    const good = await bcrypt.compare(String(otp).trim(), ch.codeHash);
    if (!good) {
      await prisma.otpLoginChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Código incorreto.' });
    }
    const meta = (ch.metadataJson && typeof ch.metadataJson === 'object' ? ch.metadataJson : {}) || {};
    const userId = String(meta.userId || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'Desafio inválido.' });
    }
    const deviceId = meta.deviceId != null ? meta.deviceId : null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true, technicianProfile: true },
    });
    if (!user || !user.isActive || !user.tenant) {
      return res.status(403).json({ error: 'Conta indisponível.' });
    }
    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: 'Verificação em duas etapas não está ativa para esta conta.' });
    }
    const emailNorm = String(user.email || '')
      .trim()
      .toLowerCase();
    if (String(ch.target || '').trim().toLowerCase() !== emailNorm) {
      return res.status(400).json({ error: 'Desafio inválido.' });
    }
    await prisma.otpLoginChallenge.update({
      where: { id: ch.id },
      data: { consumedAt: new Date(), userId: user.id },
    });
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      include: { tenant: { include: { subscription: { include: { plan: true } } } }, technicianProfile: true },
    });
    if (!full) return res.status(500).json({ error: 'Falha ao carregar utilizador.' });
    const out = await issueAppJwtAfterLogin(full, deviceId, emailNorm);
    res.json(out);
  } catch (err) {
    console.error('[2fa/verify]', err);
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
    await ensureMembershipRoleMatchesTenantKind(prisma, req.user.id);
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

/** POST /api/me/change-password — altera a palavra-passe unificada (todas as filiações do mesmo e-mail). */
router.post('/me/change-password', authUser, async (req, res) => {
  try {
    const oldPassword = String(req.body?.oldPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova são obrigatórias.' });
    }
    const pwReg = validateAppPasswordPolicy(newPassword);
    if (!pwReg.ok) return res.status(400).json({ error: pwReg.error });

    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true },
    });
    if (!me?.email) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    const emailNorm = String(me.email).trim().toLowerCase();

    const authPw = await verifyAppLoginPasswordAndEnsureAccount(prisma, emailNorm, oldPassword);
    if (!authPw.ok) return res.status(400).json({ error: 'Senha atual incorreta.' });

    const hash = await bcrypt.hash(newPassword, 10);
    await setUnifiedPasswordHashForEmail(prisma, emailNorm, hash);
    await prisma.user.updateMany({
      where: { email: emailNorm, NOT: { id: me.id } },
      data: { currentSessionId: null, currentDeviceId: null },
    });

    res.json({ ok: true, message: 'Senha alterada com sucesso.' });
  } catch (err) {
    console.error('[me/change-password]', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

/** Outras organizações com o mesmo e-mail — troca no perfil do app. */
router.get('/me/sibling-workspaces', authUser, async (req, res) => {
  try {
    if (req.user.panel === true) {
      return res.json({ workspaces: [] });
    }
    const emailNorm = String(req.user.email || '')
      .trim()
      .toLowerCase();
    if (!emailNorm) return res.json({ workspaces: [] });

    const meId = String(req.user.id || '').trim();
    const rows = await prisma.user.findMany({
      where: { email: emailNorm, isActive: true },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    });
    const usable = rows.filter((u) => u.tenant && u.tenant.status !== 'SUSPENDED' && u.tenant.status !== 'CANCELLED');
    const byTenant = new Map();
    for (const u of usable) {
      if (byTenant.has(u.tenantId)) continue;
      byTenant.set(u.tenantId, u);
    }
    /** Sempre devolver todas as organizações do e-mail (incl. sessão única) para o app resolver CLIENT vs PROVIDER. */
    const tenantIds = [...byTenant.keys()];
    if (tenantIds.length === 0) {
      return res.json({ workspaces: [] });
    }
    const grouped = await prisma.user.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenantIds } },
      _count: { id: true },
    });
    const countMap = {};
    for (const g of grouped) {
      countMap[g.tenantId] = g._count.id;
    }

    const workspaces = tenantIds.map((tid) => {
      const u = byTenant.get(tid);
      return {
        id: tid,
        name: u.tenant?.name || tid,
        slug: u.tenant?.slug || null,
        kind: u.tenant?.kind || 'COMPANY',
        memberCount: countMap[tid] || 0,
        isCurrent: u.id === meId,
      };
    });
    workspaces.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      if ((b.memberCount || 0) !== (a.memberCount || 0)) return (b.memberCount || 0) - (a.memberCount || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    res.json({ workspaces });
  } catch (err) {
    console.error('[me/sibling-workspaces]', err);
    res.status(500).json({ error: err.message });
  }
});

/** Bases de despacho (Location do tenant) — escolha no horário e regiões. */
router.get('/me/technician-service-bases', authUser, async (req, res) => {
  try {
    if (req.user.panel === true) {
      return res.json({ locations: [] });
    }
    const locations = await prisma.location.findMany({
      where: { tenantId: req.user.tenantId },
      select: { id: true, name: true, type: true, latitude: true, longitude: true, address: true },
      orderBy: { name: 'asc' },
    });
    res.json({ locations });
  } catch (err) {
    console.error('[me/technician-service-bases]', err);
    res.status(500).json({ error: err.message });
  }
});

/** Nova sessão JWT noutro utilizador (mesmo e-mail, outro tenant). */
router.post('/me/switch-workspace', authUser, async (req, res) => {
  try {
    if (req.user.panel === true) {
      return res.status(400).json({ error: 'Operação indisponível para esta sessão.' });
    }
    const tenantId = String(req.body?.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório.' });

    const emailNorm = String(req.user.email || '')
      .trim()
      .toLowerCase();
    if (!emailNorm) return res.status(400).json({ error: 'Sessão sem e-mail.' });

    const target = await prisma.user.findFirst({
      where: { email: emailNorm, tenantId, isActive: true },
      include: { tenant: { include: { subscription: { include: { plan: true } } } }, technicianProfile: true },
    });
    if (!target || !target.tenant) {
      return res.status(400).json({ error: 'Organização não encontrada para este e-mail.' });
    }
    if (target.tenant.status === 'SUSPENDED' || target.tenant.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Organização indisponível.' });
    }
    if (String(target.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Já está nesta organização.' });
    }

    const { deviceId } = req.body;
    const out = await issueAppJwtAfterLogin(target, deviceId, emailNorm);
    res.json(out);
  } catch (err) {
    console.error('[me/switch-workspace]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Verificação em duas etapas (app) ────────────────────────────────────────
router.get('/2fa/status', authUser, async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { twoFactorEnabled: true },
    });
    res.json({ enabled: !!u?.twoFactorEnabled });
  } catch (err) {
    console.error('[2fa/status]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/enable', authUser, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { twoFactorEnabled: true, email: true },
    });
    if (!me) return res.status(404).json({ error: 'Utilizador não encontrado.' });
    if (me.twoFactorEnabled) {
      return res.status(400).json({ error: 'A verificação em duas etapas já está ativa.' });
    }
    const em = String(me.email || '')
      .trim()
      .toLowerCase();
    const ch = await startEmailPurposeChallenge(prisma, {
      emailNorm: em,
      purpose: 'two_factor_enable',
      metadataJson: { userId: req.user.id },
    });
    if (!ch.ok) return res.status(ch.status || 503).json({ error: ch.error });
    res.json({ challengeToken: ch.challengeId });
  } catch (err) {
    console.error('[2fa/enable]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/enable/confirm', authUser, async (req, res) => {
  try {
    const challengeToken = String(req.body?.challengeToken || '').trim();
    const otp = String(req.body?.otp || '').trim();
    if (!challengeToken || !otp) return res.status(400).json({ error: 'Dados incompletos.' });
    const ch = await prisma.otpLoginChallenge.findUnique({ where: { id: challengeToken } });
    if (!ch || ch.consumedAt || String(ch.purpose) !== 'two_factor_enable') {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }
    if (new Date(ch.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Código expirado.' });
    }
    if (ch.attempts >= ch.maxAttempts) {
      return res.status(400).json({ error: 'Muitas tentativas. Solicite um novo código.' });
    }
    const meta = (ch.metadataJson && typeof ch.metadataJson === 'object' ? ch.metadataJson : {}) || {};
    if (String(meta.userId) !== String(req.user.id)) {
      return res.status(400).json({ error: 'Desafio inválido.' });
    }
    const emailNorm = String(req.user.email || '')
      .trim()
      .toLowerCase();
    if (String(ch.target || '').trim().toLowerCase() !== emailNorm) {
      return res.status(400).json({ error: 'Desafio inválido.' });
    }
    const good = await bcrypt.compare(String(otp).trim(), ch.codeHash);
    if (!good) {
      await prisma.otpLoginChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Código incorreto.' });
    }
    await prisma.$transaction([
      prisma.otpLoginChallenge.update({
        where: { id: ch.id },
        data: { consumedAt: new Date(), userId: req.user.id },
      }),
      prisma.user.update({ where: { id: req.user.id }, data: { twoFactorEnabled: true } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/enable/confirm]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/disable/request', authUser, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { twoFactorEnabled: true, email: true },
    });
    if (!me?.twoFactorEnabled) {
      return res.status(400).json({ error: 'A verificação em duas etapas não está ativa.' });
    }
    const em = String(me.email || '')
      .trim()
      .toLowerCase();
    const ch = await startEmailPurposeChallenge(prisma, {
      emailNorm: em,
      purpose: 'two_factor_disable',
      metadataJson: { userId: req.user.id },
    });
    if (!ch.ok) return res.status(ch.status || 503).json({ error: ch.error });
    res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/disable/request]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/2fa/disable', authUser, async (req, res) => {
  try {
    const otp = String(req.body?.otp || '').trim();
    if (!otp || otp.length < 6) return res.status(400).json({ error: 'Indique o código de 6 dígitos.' });
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, twoFactorEnabled: true },
    });
    if (!me?.twoFactorEnabled) {
      return res.status(400).json({ error: 'A verificação em duas etapas não está ativa.' });
    }
    const emailNorm = String(me.email || '')
      .trim()
      .toLowerCase();
    const rows = await prisma.otpLoginChallenge.findMany({
      where: {
        purpose: 'two_factor_disable',
        target: emailNorm,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    for (const ch of rows) {
      const meta = (ch.metadataJson && typeof ch.metadataJson === 'object' ? ch.metadataJson : {}) || {};
      if (String(meta.userId) !== String(me.id)) continue;
      if (ch.attempts >= ch.maxAttempts) continue;
      const good = await bcrypt.compare(String(otp).trim(), ch.codeHash);
      if (!good) {
        await prisma.otpLoginChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
        return res.status(400).json({ error: 'Código incorreto.' });
      }
      await prisma.$transaction([
        prisma.otpLoginChallenge.update({
          where: { id: ch.id },
          data: { consumedAt: new Date(), userId: me.id },
        }),
        prisma.user.update({ where: { id: me.id }, data: { twoFactorEnabled: false } }),
      ]);
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Código inválido ou expirado. Solicite um novo código (desligue e volte a ativar o fluxo).' });
  } catch (err) {
    console.error('[2fa/disable]', err);
    res.status(500).json({ error: err.message });
  }
});

/** E-mail único por tenant: alias derivado do e-mail do utilizador (RFC plus-addressing). */
function syntheticTenantEmailForWorkspace(userEmail, tag) {
  const e = String(userEmail || '').trim().toLowerCase();
  const at = e.indexOf('@');
  const tail = `${tag}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  if (at > 0) {
    const local = e.slice(0, at);
    const domain = e.slice(at + 1);
    return `${local}+brspark.${tail}@${domain}`;
  }
  return `workspace-${tail}@brspark.internal.invalid`;
}

/** POST /api/me/workspaces — cria tenant CLIENT ou PROVIDER e utilizador com a mesma senha; emite novo JWT. */
router.post('/me/workspaces', authUser, async (req, res) => {
  try {
    const kind = String(req.body?.kind || '').trim().toUpperCase();
    if (kind !== 'PROVIDER' && kind !== 'CLIENT') {
      return res.status(400).json({ error: 'kind deve ser PROVIDER ou CLIENT.' });
    }

    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { tenant: true },
    });
    if (!me) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    const emailNorm = String(me.email || '').trim().toLowerCase();

    const existsKind = await prisma.user.findFirst({
      where: {
        email: emailNorm,
        tenant: { kind },
      },
      select: { id: true, tenantId: true },
    });
    if (existsKind) {
      return res.status(409).json({
        error:
          kind === 'PROVIDER'
            ? 'Já existe um espaço prestador para este e-mail.'
            : 'Já existe um espaço cliente pessoal para este e-mail.',
        tenantId: existsKind.tenantId,
        userId: existsKind.id,
      });
    }

    const baseName = String(req.body?.name || me.name || 'Organização').trim();
    const slugPrefix = kind === 'PROVIDER' ? 'prestador' : 'cliente';
    let slug = '';
    for (let i = 0; i < 8; i++) {
      slug = `${slugPrefix}-${me.id.replace(/[^a-z0-9]/gi, '').slice(0, 6)}-${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
      const clash = await prisma.tenant.findUnique({ where: { slug } });
      if (!clash) break;
    }
    const tenantEmail = syntheticTenantEmailForWorkspace(emailNorm, slugPrefix);
    /** Título da organização; discriminação por `Tenant.kind` (CLIENT | PROVIDER). */
    const tenantName = baseName;

    const seatRole = kind === 'PROVIDER' ? 'PROVIDER' : 'USER';

    const { tenant: newTenant, user: newUser } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: tenantName,
          slug,
          email: tenantEmail,
          ownerName: baseName,
          kind,
          status: 'TRIAL',
        },
      });
      const seatCheck = await assertTechnicianSeatForNewUser(tx, tenant.id, seatRole);
      if (!seatCheck.ok) {
        const e = new Error(seatCheck.error || 'Limite do plano.');
        e.code = seatCheck.code || 'PLAN_MAX_TECHNICIANS';
        throw e;
      }
      const u = await tx.user.create({
        data: {
          name: me.name,
          email: emailNorm,
          password: me.password,
          tenantId: tenant.id,
          role: seatRole,
          phone: me.phone,
          avatarUrl: me.avatarUrl,
          preferredChatLocale: me.preferredChatLocale,
          ...(me.appAccountId ? { appAccountId: me.appAccountId } : {}),
        },
      });
      if (seatRole === 'PROVIDER') {
        await tx.technicianProfile.create({
          data: { userId: u.id, status: 'PENDING', score: 5 },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: u.id,
          action: 'WORKSPACE_CREATE',
          resource: emailNorm,
          category: 'AUTH',
          metadata: { kind, sourceUserId: me.id },
        },
      });
      return { tenant, user: u };
    });

    const deviceId = req.body?.deviceId;
    const out = await issueAppJwtAfterLogin(newUser, deviceId, emailNorm);
    res.status(201).json({
      ...out,
      workspace: { tenantId: newTenant.id, kind },
      message:
        kind === 'PROVIDER'
          ? 'Espaço prestador criado. A sessão foi alterada para esta organização.'
          : 'Espaço cliente criado. A sessão foi alterada para esta organização.',
    });
  } catch (err) {
    console.error('[account] POST /me/workspaces', err);
    const code = err && err.code ? String(err.code) : '';
    if (code === 'PLAN_MAX_TECHNICIANS') {
      return res.status(403).json({ error: err.message, code });
    }
    if (err && err.code === 'P2002') {
      return res.status(409).json({ error: 'Slug ou e-mail da organização já em uso. Tente novamente.' });
    }
    res.status(500).json({ error: err.message });
  }
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
          appAccountId: null,
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
    const {
      name,
      email,
      avatarUrl,
      preferredChatLocale,
      addressJson,
      technicianCoverageGeoJson,
      technicianWorkScheduleJson,
      technicianServiceLocationIds,
    } = req.body;

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
    if (
      (technicianCoverageGeoJson !== undefined ||
        technicianWorkScheduleJson !== undefined ||
        technicianServiceLocationIds !== undefined) &&
      !profile
    ) {
      return res.status(400).json({
        error: 'Só contas com perfil técnico podem guardar horários, regiões e bases de atendimento.',
      });
    }

    let normalizedWorkSchedule = undefined;
    if (technicianWorkScheduleJson !== undefined) {
      normalizedWorkSchedule = normalizeWorkScheduleJson(technicianWorkScheduleJson);
      if (technicianWorkScheduleJson !== null && !normalizedWorkSchedule) {
        return res.status(400).json({
          error: 'Formato de horários inválido.',
        });
      }
    }

    let normalizedServiceLocationIds = undefined;
    if (technicianServiceLocationIds !== undefined) {
      if (technicianServiceLocationIds === null) {
        normalizedServiceLocationIds = [];
      } else if (!Array.isArray(technicianServiceLocationIds)) {
        return res.status(400).json({ error: 'serviceLocationIds deve ser uma lista de IDs.' });
      } else {
        const ids = [...new Set(technicianServiceLocationIds.map((x) => String(x).trim()).filter(Boolean))];
        if (ids.length) {
          const found = await prisma.location.findMany({
            where: { tenantId: req.user.tenantId, id: { in: ids } },
            select: { id: true },
          });
          const ok = new Set(found.map((f) => f.id));
          for (const id of ids) {
            if (!ok.has(id)) {
              return res.status(400).json({ error: `Base/local inválido para esta organização: ${id}` });
            }
          }
        }
        normalizedServiceLocationIds = ids;
      }
    }

    let nextAvatarUrl = undefined;
    if (avatarUrl !== undefined) {
      if (avatarUrl === null || String(avatarUrl).trim() === '') {
        nextAvatarUrl = null;
      } else {
        nextAvatarUrl = ensureHttpsUrlForPublicInternet(String(avatarUrl).trim());
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.update({
        where: { id: req.user.id },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          ...(nextAvatarUrl !== undefined && { avatarUrl: nextAvatarUrl }),
          ...(localeUpdate !== undefined && { preferredChatLocale: localeUpdate }),
          ...(addressJson !== undefined && { addressJson }),
        },
      });
      if (profile) {
        const techData = {};
        if (technicianCoverageGeoJson !== undefined) {
          techData.serviceCoverageGeoJson = normalizedCoverage;
        }
        if (technicianWorkScheduleJson !== undefined) {
          techData.workScheduleJson = normalizedWorkSchedule;
        }
        if (technicianServiceLocationIds !== undefined) {
          techData.serviceLocationIds = normalizedServiceLocationIds;
        }
        if (Object.keys(techData).length) {
          await tx.technicianProfile.update({
            where: { userId: req.user.id },
            data: techData,
          });
        }
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
      select: { id: true, inviteToken: true, status: true, revisionNote: true },
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
      revisionNote: app.revisionNote || null,
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
    });
    if (!out.ok) {
      return res.status(out.status || 400).json({ error: out.error });
    }
    /** Diagnóstico: registo verifica e-mail/telefone activos antes de enviar OTP (espaço CLIENT). */
    if (String(req.body?.purpose || '').toLowerCase() === 'register') {
      res.setHeader('X-Brspark-Register-Start-Policy', 'v3-client-tenant-guard-at-send');
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
      { issueAppJwtAfterLogin },
      {
        challengeId: req.body?.challengeId,
        code: req.body?.code,
        deviceId: req.body?.deviceId,
        registerName: req.body?.name,
      }
    );
    if (!out.ok) {
      const body = { error: out.error, code: out.code, attemptsLeft: out.attemptsLeft };
      if (out.tenants) body.tenants = out.tenants;
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
    const out = await verifyRegisterOtpPhase1(prisma, {
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
      { issueAppJwtAfterLogin },
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
