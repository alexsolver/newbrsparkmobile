'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { deliverBrsparkLaravelEvent, EVENT_TYPES } = require('./brsparkSyncWebhook');

/** JWT de curta duração após OTP válido no registo — troca por sessão em `register-complete`. */
const OTP_REG_SETUP_PURPOSE = 'OTP_REG_SETUP_V1';
const OTP_REG_SETUP_TTL = process.env.OTP_REG_SETUP_TTL || '20m';

const CHALLENGE_TTL_MS = Number(process.env.OTP_TTL_MINUTES || 10) * 60 * 1000;
const RATE_MAX_START = Math.max(1, Math.min(20, Number(process.env.OTP_RATE_MAX_START || 3)));
const RATE_WINDOW_MS = Number(process.env.OTP_RATE_WINDOW_MIN || 15) * 60 * 1000;

function randomUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

/**
 * @returns {{ type: 'email'|'phone', key: string, displayEmail: string, e164?: string, phoneForDb?: string }}
 */
function parseIdentifier(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (!s) {
    return { type: 'invalid', key: '' };
  }
  if (s.includes('@') && s.length > 3) {
    const e = s.replace(/\s/g, '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return { type: 'invalid', key: '' };
    }
    return { type: 'email', key: e, displayEmail: e };
  }
  const digits = s.replace(/\D/g, '');
  if (digits.length < 10) {
    return { type: 'invalid', key: '' };
  }
  /** Número internacional explícito (ex.: enviado pelo app após escolher DDI): +… */
  const hadLeadingPlus = /^\s*\+/.test(String(raw || '').trim());
  if (hadLeadingPlus) {
    if (digits.length > 15) {
      return { type: 'invalid', key: '' };
    }
    const e164 = '+' + digits;
    return {
      type: 'phone',
      key: e164,
      e164,
      displayEmail: `u${digits}@p.brspark.app`,
      phoneForDb: e164,
    };
  }
  /** Legado: só dígitos, heurística Brasil (DDD + número). */
  let d = digits;
  if (d.length === 11 && d[0] === '0') d = d.slice(1);
  if (d.length === 10) {
    d = '55' + d;
  }
  if (d.length < 12) {
    return { type: 'invalid', key: '' };
  }
  const e164 = '+' + d;
  return {
    type: 'phone',
    key: e164,
    e164,
    displayEmail: `u${d}@p.brspark.app`,
    phoneForDb: e164,
  };
}

async function rateLimitCheck(prisma, key, purpose) {
  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const c = await prisma.otpLoginChallenge.count({
    where: {
      target: key,
      purpose,
      createdAt: { gte: since },
    },
  });
  if (c >= RATE_MAX_START) {
    return { ok: false, error: 'Muitas tentativas. Tente de novo em alguns minutos.' };
  }
  return { ok: true };
}

function make6Digit() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function otpDevPlaintextAllowed() {
  return String(process.env.NODE_ENV) !== 'production' && String(process.env.ALLOW_OTP_PLAINTEXT) === '1';
}

/**
 * OTP por e-mail: por omissão **Nylas primeiro** (`sendOtpTransactionalEmail`), depois MailerSend.
 * Outros e-mails transacionais continuam com MailerSend→Nylas. SMS/WhatsApp desativados.
 * Em desenvolvimento, ALLOW_OTP_PLAINTEXT=1 imprime o código em log para telefone.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} opts
 */
async function sendOtpToChannel(prisma, { channel, target, code, isE164Phone }) {
  if (channel === 'EMAIL' && String(target).includes('@')) {
    const { sendOtpTransactionalEmail } = require('./transactionalEmailSend');
    const { send, provider } = await sendOtpTransactionalEmail({
      to: target,
      subject: 'Seu código de acesso',
      text: i18nBrCodeMsgPlain(code),
      html: i18nBrCodeMsgHtml(code),
    });
    if (send && send.ok) {
      return { ok: true, channel: 'email', provider };
    }
    const reason =
      (send && send.skipped && send.reason) ||
      (send && send.error) ||
      (provider === 'none'
        ? 'Nenhum envio de e-mail configurado para OTP (Nylas: API Key + Grant ID, ou MailerSend).'
        : 'Falha ao enviar o código por e-mail.');
    return { ok: false, error: String(reason) };
  }

  if ((channel === 'WHATSAPP' || channel === 'SMS') && isE164Phone) {
    if (otpDevPlaintextAllowed()) {
      console.log('[otp dev plaintext]', target, code);
      return { ok: true, dev: true, channel: 'log' };
    }
    return {
      ok: false,
      error:
        channel === 'WHATSAPP'
          ? 'Login e registo por WhatsApp não estão disponíveis. Use um endereço de e-mail.'
          : 'Login e registo por SMS não estão disponíveis. Use um endereço de e-mail.',
    };
  }

  return { ok: false, error: 'Canal inválido.' };
}

function i18nBrCodeMsg(code) {
  return `BrSpark: seu código é ${code}. Não compartilhe. Expira em ${String(process.env.OTP_TTL_MINUTES || 10)} min.`;
}
function i18nBrCodeMsgPlain(code) {
  return i18nBrCodeMsg(code);
}
function i18nBrCodeMsgHtml(code) {
  return (
    '<p>Seu código: <b style="font-size: 22px; letter-spacing: 4px">' + escapeOtpHtml(code) + '</b></p><p>Expira em ' + String(process.env.OTP_TTL_MINUTES || 10) + ' min.</p>'
  );
}
function escapeOtpHtml(t) {
  return String(t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ identifier: string, channelPref?: string, purpose?: string, nameIfRegister?: string, registerPhone?: string, resolveAppDefaultTenantId?: () => Promise<string|null> }} opts
 */
async function startChallenge(prisma, { identifier, channelPref, purpose, nameIfRegister, registerPhone, resolveAppDefaultTenantId }) {
  const purposeN = String(purpose || 'login');
  const nameTrim = nameIfRegister != null && String(nameIfRegister).trim() ? String(nameIfRegister).trim() : undefined;

  let metadataJson = { nameIfRegister: nameTrim };
  let parsed = parseIdentifier(identifier);

  if (purposeN === 'register') {
    if (parsed.type !== 'email') {
      return {
        ok: false,
        error: 'No registo use um e-mail válido. O código de verificação é enviado apenas por e-mail.',
        status: 400,
      };
    }
    const phoneParsed = parseIdentifier(String(registerPhone || '').trim());
    if (phoneParsed.type !== 'phone' || !phoneParsed.e164) {
      return {
        ok: false,
        error: 'Indique um telefone válido com DDD e número (mín. 10 dígitos nacionais ou formato internacional).',
        status: 400,
      };
    }
    metadataJson.phoneIfRegister = phoneParsed.e164;

    if (typeof resolveAppDefaultTenantId === 'function') {
      const tid = await resolveAppDefaultTenantId();
      if (tid) {
        const emailNorm = parsed.key;
        const existingEmail = await prisma.user.findUnique({
          where: { email_tenantId: { email: emailNorm, tenantId: tid } },
        });
        if (existingEmail) {
          return {
            ok: false,
            code: 'ACCOUNT_EXISTS',
            error: 'Já existe uma conta com este e-mail. Use Entrar ou recuperação de senha.',
            status: 409,
          };
        }
        const existingPhone = await prisma.user.findFirst({
          where: { tenantId: tid, phone: phoneParsed.e164 },
        });
        if (existingPhone) {
          return {
            ok: false,
            code: 'PHONE_IN_USE',
            error: 'Este telefone já está associado a uma conta.',
            status: 409,
          };
        }
      }
    }
  } else if (parsed.type === 'invalid') {
    return { ok: false, error: 'Informe um e-mail válido ou telefone (DD + número).', status: 400 };
  }

  const key = parsed.type === 'email' ? parsed.key : parsed.key;
  const limit = await rateLimitCheck(prisma, key, purposeN);
  if (!limit.ok) {
    return { ok: false, error: limit.error, status: 429 };
  }

  let chChannel = 'SMS';
  if (parsed.type === 'email') {
    chChannel = 'EMAIL';
  } else {
    const pref = String(channelPref || 'sms')
      .trim()
      .toLowerCase();
    if (pref === 'whatsapp' || pref === 'wa') chChannel = 'WHATSAPP';
  }

  const code = make6Digit();
  const id = randomUuid();
  const codeHash = await bcrypt.hash(code, 8);

  const targetForRow = key;
  const exp = new Date(Date.now() + CHALLENGE_TTL_MS);
  const row = await prisma.otpLoginChallenge.create({
    data: {
      id,
      channel: chChannel,
      target: targetForRow,
      codeHash,
      purpose: purposeN,
      maxAttempts: 5,
      expiresAt: exp,
      metadataJson,
    },
  });

  const isPhone = parsed.type === 'phone';
  const isE164 = isPhone && parsed.e164;
  const sendTarget =
    chChannel === 'EMAIL' && parsed.type === 'email' ? parsed.displayEmail : isE164 ? parsed.e164 : parsed.key;

  const out = await sendOtpToChannel(prisma, {
    channel: chChannel,
    target: sendTarget,
    code,
    isE164Phone: isPhone,
  });
  if (!out.ok) {
    await prisma.otpLoginChallenge.delete({ where: { id: row.id } }).catch(() => {});
    return { ok: false, error: out.error, status: 503 };
  }

  const res = { ok: true, challengeId: row.id, channel: chChannel, expiresInSec: Math.floor(CHALLENGE_TTL_MS / 1000) };
  if (out.dev) {
    res.devCode = code;
  }
  return res;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {any} assertTechnicianSeatForNewUser
 * @param {any} resolveAppDefaultTenantId
 * @param {any} issueAppJwtAfterLogin
 */
async function verifyChallenge(
  prisma,
  { assertTechnicianSeatForNewUser, resolveAppDefaultTenantId, issueAppJwtAfterLogin },
  { challengeId, code, deviceId, registerName }
) {
  const ch = await prisma.otpLoginChallenge.findUnique({ where: { id: String(challengeId) } });
  if (!ch || ch.consumedAt) {
    return { ok: false, error: 'Código inválido ou expirado.', status: 400 };
  }
  if (new Date(ch.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'Código expirado. Solicite outro.', status: 400 };
  }
  if (ch.attempts >= ch.maxAttempts) {
    return { ok: false, error: 'Muitas tentativas. Solicite um novo código.', status: 400 };
  }

  const good = await bcrypt.compare(String(code).trim(), ch.codeHash);
  if (!good) {
    await prisma.otpLoginChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: 'Código incorreto.', status: 400, attemptsLeft: ch.maxAttempts - ch.attempts - 1 };
  }

  const meta = (ch.metadataJson && typeof ch.metadataJson === 'object' ? ch.metadataJson : {}) || {};
  const nameFromMeta = registerName != null && String(registerName).trim() ? String(registerName).trim() : meta.nameIfRegister;

  const isEmail = ch.target.includes('@');
  const displayEmail = isEmail ? ch.target : `u${ch.target.replace(/\D/g, '')}@p.brspark.app`;
  const phoneVal = isEmail ? null : ch.target;

  const defaultTenantId = await resolveAppDefaultTenantId();
  if (!defaultTenantId) {
    return {
      ok: false,
      error: 'Configuração do servidor: tenant master BrSpark (slug brspark) não encontrada.',
      status: 503,
    };
  }

  let user = await prisma.user.findUnique({
    where: { email_tenantId: { email: displayEmail, tenantId: defaultTenantId } },
    include: { tenant: true, technicianProfile: true },
  });
  if (!user) {
    if (ch.purpose === 'login') {
      return {
        ok: false,
        code: 'USER_NOT_FOUND',
        error: 'Conta não encontrada. Crie uma conta (registo) ou use outro e-mail/telefone.',
        status: 404,
      };
    }
    if (ch.purpose === 'register' && !nameFromMeta) {
      return {
        ok: false,
        code: 'NAME_REQUIRED',
        error: 'Indique o nome completo no passo de registo.',
        status: 400,
      };
    }
    const seat = await assertTechnicianSeatForNewUser(prisma, defaultTenantId, 'USER');
    if (!seat.ok) {
      return { ok: false, error: seat.error, code: seat.code, status: 403 };
    }
    const name =
      (nameFromMeta && String(nameFromMeta).trim()) || (isEmail ? displayEmail.split('@')[0] : 'Prestador');
    const passHash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
    const tenant = await prisma.tenant.findUnique({ where: { id: defaultTenantId } });
    if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      return { ok: false, error: 'Não é possível criar conta agora.', status: 403 };
    }
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: String(name).trim(),
          email: displayEmail,
          password: passHash,
          tenantId: defaultTenantId,
          phone: phoneVal,
          role: 'USER',
          phoneVerifiedAt: phoneVal ? new Date() : null,
        },
        include: { tenant: { include: { subscription: { include: { plan: true } } } }, technicianProfile: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: defaultTenantId,
          userId: u.id,
          action: 'USER_REGISTER_OTP',
          resource: displayEmail,
          category: 'AUTH',
        },
      });
      return u;
    });
    deliverBrsparkLaravelEvent({
      type: EVENT_TYPES.USER_CREATED,
      idempotencyKey: `user-${user.id}-created`,
      payload: { userId: user.id, tenantId: user.tenantId, email: user.email, phone: user.phone, source: 'otp' },
    }).catch((e) => console.warn('[otp] sync webhook', e));
  } else {
    if (phoneVal) {
      await prisma.user
        .update({ where: { id: user.id }, data: { phone: phoneVal, phoneVerifiedAt: new Date() } })
        .catch(() => {});
    }
  }

  await prisma.otpLoginChallenge.update({
    where: { id: ch.id },
    data: { consumedAt: new Date(), userId: user.id },
  });

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    include: { tenant: { include: { subscription: { include: { plan: true } } } }, technicianProfile: true },
  });
  if (!full) {
    return { ok: false, error: 'Falha ao recarregar utilizador.', status: 500 };
  }
  if (!full.isActive) {
    return { ok: false, error: 'Conta suspensa.', status: 403 };
  }
  if (full.tenant.status === 'SUSPENDED' || full.tenant.status === 'CANCELLED') {
    return { ok: false, error: 'Conta de organização suspensa.', status: 403 };
  }
  if (phoneVal) {
    deliverBrsparkLaravelEvent({
      type: EVENT_TYPES.USER_PHONE_VERIFIED,
      idempotencyKey: `user-${user.id}-phonever-${Date.now()}`,
      payload: { userId: user.id, tenantId: user.tenantId, phone: phoneVal },
    }).catch(() => {});
  }
  const out = await issueAppJwtAfterLogin(full, deviceId, displayEmail);
  return { ok: true, status: 200, ...out };
}

/**
 * Registo em 2 fases: valida OTP de registo **sem** criar utilizador nem emitir JWT de sessão.
 * Devolve `setupToken` para `completeRegisterFromSetupToken` (definição de senha).
 */
async function verifyRegisterOtpPhase1(prisma, { resolveAppDefaultTenantId }, { challengeId, code, registerName }) {
  const ch = await prisma.otpLoginChallenge.findUnique({ where: { id: String(challengeId) } });
  if (!ch || ch.consumedAt) {
    return { ok: false, error: 'Código inválido ou expirado.', status: 400 };
  }
  if (String(ch.purpose || '') !== 'register') {
    return { ok: false, error: 'Fluxo inválido para este código.', status: 400 };
  }
  if (new Date(ch.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'Código expirado. Solicite outro.', status: 400 };
  }
  if (ch.attempts >= ch.maxAttempts) {
    return { ok: false, error: 'Muitas tentativas. Solicite um novo código.', status: 400 };
  }

  const good = await bcrypt.compare(String(code).trim(), ch.codeHash);
  if (!good) {
    await prisma.otpLoginChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: 'Código incorreto.', status: 400, attemptsLeft: ch.maxAttempts - ch.attempts - 1 };
  }

  const meta = (ch.metadataJson && typeof ch.metadataJson === 'object' ? ch.metadataJson : {}) || {};
  const nameFromMeta =
    registerName != null && String(registerName).trim()
      ? String(registerName).trim()
      : meta.nameIfRegister != null && String(meta.nameIfRegister).trim()
        ? String(meta.nameIfRegister).trim()
        : null;
  if (!nameFromMeta) {
    return { ok: false, code: 'NAME_REQUIRED', error: 'Indique o nome completo no passo de registo.', status: 400 };
  }

  const isEmail = ch.target.includes('@');
  const displayEmail = isEmail ? ch.target : `u${ch.target.replace(/\D/g, '')}@p.brspark.app`;
  const phoneE164 =
    meta.phoneIfRegister != null && String(meta.phoneIfRegister).trim()
      ? String(meta.phoneIfRegister).trim()
      : null;
  if (!phoneE164) {
    return {
      ok: false,
      code: 'PHONE_REQUIRED',
      error: 'Registo incompleto: falta o telefone associado ao pedido. Solicite um novo código.',
      status: 400,
    };
  }

  const defaultTenantId = await resolveAppDefaultTenantId();
  if (!defaultTenantId) {
    return {
      ok: false,
      error: 'Configuração do servidor: tenant master BrSpark (slug brspark) não encontrada.',
      status: 503,
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email_tenantId: { email: displayEmail, tenantId: defaultTenantId } },
  });
  if (existing) {
    return {
      ok: false,
      code: 'ACCOUNT_EXISTS',
      error: 'Já existe uma conta com este e-mail ou telefone. Use Entrar ou recuperação de senha.',
      status: 409,
    };
  }
  const existingPhone = await prisma.user.findFirst({
    where: { tenantId: defaultTenantId, phone: phoneE164 },
  });
  if (existingPhone) {
    return {
      ok: false,
      code: 'PHONE_IN_USE',
      error: 'Este telefone já está associado a uma conta.',
      status: 409,
    };
  }

  await prisma.otpLoginChallenge.update({
    where: { id: ch.id },
    data: { consumedAt: new Date(), userId: null },
  });

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    return { ok: false, error: 'Servidor mal configurado (JWT).', status: 500 };
  }

  const jti = randomUuid();
  const setupToken = jwt.sign(
    {
      purpose: OTP_REG_SETUP_PURPOSE,
      jti,
      email: displayEmail,
      phone: phoneE164,
      name: nameFromMeta,
    },
    jwtSecret,
    { expiresIn: OTP_REG_SETUP_TTL },
  );

  return { ok: true, status: 200, setupToken };
}

/**
 * Cria utilizador com senha após `verifyRegisterOtpPhase1`.
 */
async function completeRegisterFromSetupToken(
  prisma,
  { assertTechnicianSeatForNewUser, resolveAppDefaultTenantId, issueAppJwtAfterLogin },
  { setupToken, password, consent, deviceId },
) {
  if (!consent) {
    return { ok: false, error: 'Você deve aceitar os Termos de Uso e a Política de Privacidade.', status: 400 };
  }
  const rawPass = String(password || '');
  if (rawPass.length < 6) {
    return { ok: false, error: 'Senha deve ter ao menos 6 caracteres.', status: 400 };
  }

  const jwtSecret = String(process.env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    return { ok: false, error: 'Servidor mal configurado (JWT).', status: 500 };
  }

  let payload;
  try {
    payload = jwt.verify(String(setupToken || '').trim(), jwtSecret);
  } catch {
    return { ok: false, error: 'Sessão de registo expirada ou inválida. Solicite um novo código.', status: 400 };
  }
  if (!payload || payload.purpose !== OTP_REG_SETUP_PURPOSE || !payload.email) {
    return { ok: false, error: 'Token de registo inválido.', status: 400 };
  }

  const displayEmail = String(payload.email).trim().toLowerCase();
  const name = String(payload.name || '').trim() || displayEmail.split('@')[0];
  const phoneVal = payload.phone != null && String(payload.phone).trim() ? String(payload.phone).trim() : null;
  if (!phoneVal) {
    return { ok: false, error: 'Token de registo inválido ou incompleto (telefone). Solicite um novo código.', status: 400 };
  }

  const defaultTenantId = await resolveAppDefaultTenantId();
  if (!defaultTenantId) {
    return {
      ok: false,
      error: 'Registo indisponível: não foi encontrada a tenant master BrSpark.',
      status: 503,
    };
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: defaultTenantId } });
  if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
    return { ok: false, error: 'Novos registros estão temporariamente indisponíveis.', status: 403 };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email_tenantId: { email: displayEmail, tenantId: defaultTenantId } },
  });
  if (existingUser) {
    return { ok: false, error: 'Este e-mail já está cadastrado.', status: 409 };
  }

  const existingByPhone = await prisma.user.findFirst({
    where: { tenantId: defaultTenantId, phone: phoneVal },
  });
  if (existingByPhone) {
    return { ok: false, error: 'Este telefone já está cadastrado.', status: 409 };
  }

  const seat = await assertTechnicianSeatForNewUser(prisma, defaultTenantId, 'USER');
  if (!seat.ok) {
    return { ok: false, error: seat.error, code: seat.code, status: 403 };
  }

  const passHash = await bcrypt.hash(rawPass, 10);

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name,
        email: displayEmail,
        password: passHash,
        tenantId: defaultTenantId,
        phone: phoneVal,
        role: 'USER',
        phoneVerifiedAt: phoneVal ? new Date() : null,
      },
      include: { tenant: { include: { subscription: { include: { plan: true } } } }, technicianProfile: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: defaultTenantId,
        userId: u.id,
        action: 'USER_REGISTER_OTP_PASSWORD',
        resource: displayEmail,
        category: 'AUTH',
      },
    });
    return u;
  });

  deliverBrsparkLaravelEvent({
    type: EVENT_TYPES.USER_CREATED,
    idempotencyKey: `user-${user.id}-register-otp-pwd`,
    payload: { userId: user.id, tenantId: user.tenantId, email: user.email, phone: user.phone, source: 'otp_password' },
  }).catch((e) => console.warn('[otp reg complete] sync webhook', e));

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    include: { tenant: { include: { subscription: { include: { plan: true } } } }, technicianProfile: true },
  });
  if (!full) {
    return { ok: false, error: 'Falha ao recarregar utilizador.', status: 500 };
  }

  const out = await issueAppJwtAfterLogin(full, deviceId, displayEmail);
  return { ok: true, status: 200, ...out };
}

module.exports = {
  startChallenge,
  verifyChallenge,
  verifyRegisterOtpPhase1,
  completeRegisterFromSetupToken,
  parseIdentifier,
};
