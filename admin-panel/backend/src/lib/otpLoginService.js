'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { deliverBrsparkLaravelEvent, EVENT_TYPES } = require('./brsparkSyncWebhook');

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

/**
 * @param {object} prisma
 * @param {object} opts
 */
async function sendOtpToChannel({ channel, target, code, isE164Phone }) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  if (!sid || !token) {
    if (String(process.env.NODE_ENV) !== 'production' && String(process.env.ALLOW_OTP_PLAINTEXT) === '1') {
      console.log('[otp dev plaintext]', target, code);
      return { ok: true, dev: true, channel: 'log' };
    }
    if (String(process.env.NODE_ENV) !== 'production') {
      console.warn('[otp] Twilio não configurado — a não ser ALLOW_OTP_PLAINTEXT=1, OTP não é enviado');
    }
    return { ok: false, error: 'Entrega de código indisponível. Configure Twilio (SMS/WhatsApp).' };
  }
  // eslint-disable-next-line global-require
  const twilio = require('twilio')(sid, token);
  if (channel === 'WHATSAPP' && isE164Phone) {
    const wfrom = String(process.env.TWILIO_WHATSAPP_FROM || '').trim();
    if (!wfrom) {
      return { ok: false, error: 'Canal WhatsApp indisponível. Defina TWILIO_WHATSAPP_FROM.' };
    }
    const body = i18nBrCodeMsg(code);
    await twilio.messages.create({
      from: wfrom,
      to: 'whatsapp:' + String(target).replace(/^whatsapp:/i, ''),
      body,
    });
    return { ok: true, channel: 'whatsapp' };
  }
  if (isE164Phone) {
    const mfrom = String(process.env.TWILIO_SMS_FROM || process.env.TWILIO_PHONE_NUMBER || '').trim();
    if (!mfrom) {
      return { ok: false, error: 'Número SMS Twilio (TWILIO_SMS_FROM) em falta.' };
    }
    const body = i18nBrCodeMsg(code);
    await twilio.messages.create({ to: String(target), from: mfrom, body });
    return { ok: true, channel: 'sms' };
  }
  if (channel === 'EMAIL' && String(target).includes('@')) {
    const { sendTransactionalEmailWithFallback } = require('./transactionalEmailSend');
    await sendTransactionalEmailWithFallback({
      to: target,
      subject: 'Seu código de acesso',
      text: i18nBrCodeMsgPlain(code),
      html: i18nBrCodeMsgHtml(code),
    });
    return { ok: true, channel: 'email' };
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
 */
async function startChallenge(prisma, { identifier, channelPref, purpose, nameIfRegister }) {
  const parsed = parseIdentifier(identifier);
  if (parsed.type === 'invalid') {
    return { ok: false, error: 'Informe um e-mail válido ou telefone (DD + número).', status: 400 };
  }

  const purposeN = String(purpose || 'login');
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
      metadataJson: { nameIfRegister: nameIfRegister != null ? String(nameIfRegister).trim() : undefined },
    },
  });

  const isPhone = parsed.type === 'phone';
  const isE164 = isPhone && parsed.e164;
  const sendTarget =
    chChannel === 'EMAIL' && parsed.type === 'email' ? parsed.displayEmail : isE164 ? parsed.e164 : parsed.key;

  const out = await sendOtpToChannel({
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
    return { ok: false, error: 'Configuração do servidor: APP_DEFAULT_TENANT_SLUG em falta.', status: 500 };
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

module.exports = {
  startChallenge,
  verifyChallenge,
  parseIdentifier,
};
