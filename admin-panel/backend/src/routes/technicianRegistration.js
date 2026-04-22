'use strict';

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs').promises;
const prisma = require('../db');
const { auditActor, auditContextMetadata } = require('../lib/auditActor');
const {
  materializeApprovedApplication,
  mirrorApprovedLegacyRegistrationToProviderNetwork,
  normalizeFacePhotos,
  MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT,
} = require('../lib/technicianRegistrationMaterialize');
const { defaultEmptySchedule, initialTechRegistrationResponsesJson } = require('../lib/techRegistrationDefaults');
const { normalizeServiceCoverageGeo } = require('../lib/technicianServiceCoverage');
const { sendTransactionalEmailWithFallback, sendOtpTransactionalEmail } = require('../lib/transactionalEmailSend');
const { syncComprefaceGalleryAfterUserChange } = require('../lib/comprefaceGallerySyncTrigger');
const { sendExpoPushToMany } = require('../services/expoPush');
const { handleTechnicianProfilePhotoAiValidate } = require('../lib/handleTechnicianProfilePhotoAiValidate');
const {
  draftPatchTouchesLockedIdentity,
  respondWithTechnicianIdentityLockIfNeeded,
} = require('../lib/technicianIdentityLock');
const { verifyTechRegEnrollmentAgainstProfile } = require('../lib/techRegComprefaceVerify');
const {
  extractIdDocumentWithOpenAi,
  verifyDocumentFaceMatchesProfileOpenAi,
} = require('../lib/techRegIdDocumentOpenAi');
const authUser = require('../middleware/authUser');
const optionalAuthUser = require('../middleware/optionalAuthUser');
const { assertTenantAccess, resolveScopedTenantId } = require('../lib/authorization');

const MAX_FACE_ENROLLMENT_BYTES = 5 * 1024 * 1024;
const MAX_FACE_ENROLLMENT_PHOTOS = 12;
const MAX_DOC_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const TECH_REG_RECENT_SESSION_MAX_AGE_SECONDS = Number(process.env.TECH_REG_RECENT_SESSION_MAX_AGE_SECONDS || 12 * 3600);
const TECH_REG_SUBMIT_OTP_TTL_SECONDS = Number(process.env.TECH_REG_SUBMIT_OTP_TTL_SECONDS || 10 * 60);
const TECH_REG_SUBMIT_OTP_MAX_ATTEMPTS = Number(process.env.TECH_REG_SUBMIT_OTP_MAX_ATTEMPTS || 5);
const TECH_REG_SUBMIT_OTP_PURPOSE = 'TECH_REG_SUBMIT_OTP';

/** Desafio OTP efêmero em memória por instância (cid -> payload). */
const techRegSubmitOtpChallenges = new Map();

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
  return assertTenantAccess(req.authorization, applicationTenantId);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTemplateVars(raw, vars) {
  let out = String(raw || '');
  const safeVars = vars && typeof vars === 'object' ? vars : {};
  for (const [k, v] of Object.entries(safeVars)) {
    out = out.replaceAll(`{{${k}}}`, String(v ?? ''));
  }
  return out;
}

function emailBodyToSimpleHtml(text) {
  const safe = escapeHtml(String(text || ''));
  const lines = safe.split(/\n{2,}/).map((blk) => blk.replace(/\n/g, '<br>'));
  return lines.map((blk) => `<p>${blk}</p>`).join('');
}

function nowMs() {
  return Date.now();
}

function cleanupExpiredTechRegOtpChallenges() {
  const now = nowMs();
  for (const [cid, row] of techRegSubmitOtpChallenges.entries()) {
    if (!row || row.expiresAtMs <= now || row.used === true) {
      techRegSubmitOtpChallenges.delete(cid);
    }
  }
}

function make6DigitOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashTechRegOtp({ code, challengeId, userId }) {
  return crypto
    .createHash('sha256')
    .update(`${String(code)}|${String(challengeId)}|${String(userId)}|${String(process.env.JWT_SECRET || '')}`)
    .digest('hex');
}

async function issueTechRegSubmitOtpChallenge({ app, reqUser }) {
  cleanupExpiredTechRegOtpChallenges();
  const challengeId = crypto.randomUUID();
  const otpCode = make6DigitOtp();
  const expiresAtMs = nowMs() + TECH_REG_SUBMIT_OTP_TTL_SECONDS * 1000;
  const otpHash = hashTechRegOtp({ code: otpCode, challengeId, userId: reqUser.id });

  techRegSubmitOtpChallenges.set(challengeId, {
    appId: app.id,
    tenantId: app.tenantId,
    userId: reqUser.id,
    invitedEmail: String(app.invitedEmail || '').trim().toLowerCase(),
    otpHash,
    attempts: 0,
    expiresAtMs,
    used: false,
  });

  const challengeToken = jwt.sign(
    {
      purpose: TECH_REG_SUBMIT_OTP_PURPOSE,
      cid: challengeId,
      appId: app.id,
      userId: reqUser.id,
      invitedEmail: String(app.invitedEmail || '').trim().toLowerCase(),
    },
    process.env.JWT_SECRET,
    { expiresIn: TECH_REG_SUBMIT_OTP_TTL_SECONDS }
  );

  const email = String(app.invitedEmail || '').trim().toLowerCase();
  const text =
    `Seu código de confirmação do cadastro de prestador é: ${otpCode}\n\n` +
    `Validade: ${Math.ceil(TECH_REG_SUBMIT_OTP_TTL_SECONDS / 60)} minuto(s).\n` +
    'Se você não solicitou este código, ignore este e-mail.';
  const html =
    `<p>Seu código de confirmação do cadastro de prestador é:</p>` +
    `<p style="font-size:24px;font-weight:800;letter-spacing:4px">${escapeHtml(otpCode)}</p>` +
    `<p>Validade: <strong>${Math.ceil(TECH_REG_SUBMIT_OTP_TTL_SECONDS / 60)} minuto(s)</strong>.</p>` +
    '<p>Se você não solicitou este código, ignore este e-mail.</p>';

  await sendOtpTransactionalEmail({
    to: email,
    subject: 'BrSpark — código de confirmação do cadastro',
    text,
    html,
  }).catch((e) => {
    console.warn('[tech-reg otp] envio e-mail:', e?.message || e);
  });

  return { challengeToken };
}

function verifyTechRegSubmitOtpChallenge({ app, reqUser, challengeToken, otpCode }) {
  cleanupExpiredTechRegOtpChallenges();
  const tokenStr = String(challengeToken || '').trim();
  const code = String(otpCode || '').trim();
  if (!tokenStr || !code) {
    return { ok: false, code: 'OTP_REQUIRED', error: 'Informe o código de confirmação.' };
  }
  let payload;
  try {
    payload = jwt.verify(tokenStr, process.env.JWT_SECRET);
  } catch {
    return { ok: false, code: 'OTP_EXPIRED', error: 'Código expirado. Solicite um novo envio.' };
  }
  if (
    payload?.purpose !== TECH_REG_SUBMIT_OTP_PURPOSE ||
    String(payload?.appId || '') !== String(app.id) ||
    String(payload?.userId || '') !== String(reqUser.id)
  ) {
    return { ok: false, code: 'OTP_INVALID', error: 'Desafio de confirmação inválido.' };
  }
  const challengeId = String(payload?.cid || '').trim();
  if (!challengeId) {
    return { ok: false, code: 'OTP_INVALID', error: 'Desafio de confirmação inválido.' };
  }
  const row = techRegSubmitOtpChallenges.get(challengeId);
  if (!row || row.used === true || row.expiresAtMs <= nowMs()) {
    techRegSubmitOtpChallenges.delete(challengeId);
    return { ok: false, code: 'OTP_EXPIRED', error: 'Código expirado. Solicite um novo envio.' };
  }
  if (
    String(row.appId || '') !== String(app.id) ||
    String(row.userId || '') !== String(reqUser.id) ||
    String(row.invitedEmail || '') !== String(app.invitedEmail || '').trim().toLowerCase()
  ) {
    techRegSubmitOtpChallenges.delete(challengeId);
    return { ok: false, code: 'OTP_INVALID', error: 'Desafio de confirmação inválido.' };
  }
  if (row.attempts >= TECH_REG_SUBMIT_OTP_MAX_ATTEMPTS) {
    techRegSubmitOtpChallenges.delete(challengeId);
    return { ok: false, code: 'OTP_EXPIRED', error: 'Muitas tentativas. Solicite um novo código.' };
  }
  const expected = hashTechRegOtp({ code, challengeId, userId: reqUser.id });
  if (expected !== row.otpHash) {
    row.attempts += 1;
    techRegSubmitOtpChallenges.set(challengeId, row);
    return { ok: false, code: 'OTP_INVALID', error: 'Código inválido. Verifique e tente novamente.' };
  }
  techRegSubmitOtpChallenges.delete(challengeId);
  return { ok: true };
}

async function logTemplateNotification({ templateId, recipient, channel, status, metadata }) {
  if (!templateId) return;
  await prisma.notificationLog
    .create({
      data: {
        templateId,
        recipient: String(recipient || '').trim(),
        channel,
        status,
        metadata: metadata && typeof metadata === 'object' ? metadata : null,
      },
    })
    .catch(() => {});
}

function techRegStatusCopy(status, ctx) {
  const tenantName = String(ctx?.tenantName || '').trim();
  const revisionNote = String(ctx?.revisionNote || '').trim();
  const reason = String(ctx?.reason || '').trim();
  if (status === 'SUBMITTED') {
    return {
      pushTitle: 'Cadastro enviado',
      pushBody: tenantName
        ? `Recebemos sua candidatura para ${tenantName}.`
        : 'Recebemos sua candidatura de prestador.',
      emailSubject: `BrSpark — candidatura de prestador recebida${tenantName ? ` (${tenantName})` : ''}`,
      emailText:
        `Olá,\n\nRecebemos sua candidatura de prestador${tenantName ? ` para ${tenantName}` : ''}. ` +
        'Nossa equipe fará a análise e você será avisado quando houver atualização de status.\n',
      emailHtml:
        `<p>Olá,</p><p>Recebemos sua <strong>candidatura de prestador</strong>${tenantName ? ` para <strong>${escapeHtml(tenantName)}</strong>` : ''}. ` +
        'Nossa equipe fará a análise e você será avisado quando houver atualização de status.</p>',
    };
  }
  if (status === 'NEEDS_REVISION') {
    return {
      pushTitle: 'Ajustes no cadastro',
      pushBody: revisionNote
        ? `Ajustes solicitados: ${revisionNote.slice(0, 120)}${revisionNote.length > 120 ? '…' : ''}`
        : 'A equipe solicitou ajustes na sua candidatura.',
      emailSubject: 'BrSpark — ajustes solicitados no cadastro de prestador',
      emailText:
        `Olá,\n\nA equipe solicitou ajustes na sua candidatura de prestador${tenantName ? ` (${tenantName})` : ''}.\n\n` +
        `${revisionNote ? `Mensagem da revisão:\n${revisionNote}\n\n` : ''}` +
        'Abra o app BrSpark para corrigir e reenviar.\n',
      emailHtml:
        `<p>Olá,</p><p>A equipe solicitou <strong>ajustes</strong> na sua candidatura de prestador${tenantName ? ` (${escapeHtml(tenantName)})` : ''}.</p>` +
        (revisionNote
          ? `<p><strong>Mensagem da revisão:</strong><br>${escapeHtml(revisionNote)}</p>`
          : '') +
        '<p>Abra o app BrSpark para corrigir e reenviar.</p>',
    };
  }
  if (status === 'APPROVED') {
    return {
      pushTitle: 'Cadastro aprovado',
      pushBody: 'Seu cadastro de prestador foi aprovado. O modo Prestador já está disponível no app.',
      emailSubject: 'BrSpark — cadastro de prestador aprovado',
      emailText:
        `Olá,\n\nSeu cadastro de prestador foi aprovado${tenantName ? ` para ${tenantName}` : ''}.\n` +
        'Você já pode usar o modo Prestador no app BrSpark.\n',
      emailHtml:
        `<p>Olá,</p><p>Seu cadastro de prestador foi <strong>aprovado</strong>${tenantName ? ` para <strong>${escapeHtml(tenantName)}</strong>` : ''}.</p>` +
        '<p>Você já pode usar o modo Prestador no app BrSpark.</p>',
    };
  }
  if (status === 'REJECTED') {
    return {
      pushTitle: 'Cadastro não aprovado',
      pushBody: reason
        ? `Motivo: ${reason.slice(0, 120)}${reason.length > 120 ? '…' : ''}`
        : 'Sua candidatura de prestador foi encerrada sem aprovação.',
      emailSubject: 'BrSpark — cadastro de prestador não aprovado',
      emailText:
        `Olá,\n\nSua candidatura de prestador${tenantName ? ` (${tenantName})` : ''} foi encerrada sem aprovação.\n` +
        `${reason ? `\nMotivo informado:\n${reason}\n` : ''}`,
      emailHtml:
        `<p>Olá,</p><p>Sua candidatura de prestador${tenantName ? ` (${escapeHtml(tenantName)})` : ''} foi encerrada sem aprovação.</p>` +
        (reason ? `<p><strong>Motivo informado:</strong><br>${escapeHtml(reason)}</p>` : ''),
    };
  }
  return null;
}

function templateKeysForTechRegStatus(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'SUBMITTED') {
    return [
      'tech_reg_submitted_candidate_push',
      'tech_reg_submitted_candidate_email',
      'tech_reg_submitted_reviewer_push',
    ];
  }
  if (s === 'NEEDS_REVISION') {
    return ['tech_reg_needs_revision_candidate_push', 'tech_reg_needs_revision_candidate_email'];
  }
  if (s === 'APPROVED') {
    return ['tech_reg_approved_candidate_push', 'tech_reg_approved_candidate_email'];
  }
  if (s === 'REJECTED') {
    return ['tech_reg_rejected_candidate_push', 'tech_reg_rejected_candidate_email'];
  }
  return [];
}

function resolveTemplateText(templatesByKey, key, vars, fallback) {
  const tpl = templatesByKey[key];
  if (!tpl || tpl.isActive === false) return { ...fallback, templateId: null };
  const subject = renderTemplateVars(tpl.subject || fallback.subject || '', vars);
  const body = renderTemplateVars(tpl.body || fallback.body || '', vars);
  return {
    subject: subject || fallback.subject || '',
    body: body || fallback.body || '',
    templateId: tpl.id || null,
  };
}

function hasRecentAppSessionForTechRegSubmit(reqUser) {
  if (!reqUser || reqUser.panel === true) return false;
  const iatSec = Number(reqUser.iat || 0);
  if (!Number.isFinite(iatSec) || iatSec <= 0) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  const age = nowSec - iatSec;
  return age >= 0 && age <= TECH_REG_RECENT_SESSION_MAX_AGE_SECONDS;
}

async function notifyTechRegistrationStatus(opts) {
  try {
    const tenantId = String(opts?.tenantId || '').trim();
    const invitedEmail = String(opts?.invitedEmail || '').trim().toLowerCase();
    const status = String(opts?.status || '').trim().toUpperCase();
    if (!tenantId || !invitedEmail || !status) return;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const tenantName = String(tenant?.name || '').trim();
    const revisionNote = String(opts?.revisionNote || '').trim();
    const reason = String(opts?.reason || '').trim();
    const copy = techRegStatusCopy(status, {
      tenantName: tenant?.name || '',
      revisionNote,
      reason,
    });
    if (!copy) return;
    const vars = {
      tenantName,
      invitedEmail,
      revisionNote,
      reason,
      status,
    };
    const keys = templateKeysForTechRegStatus(status);
    const templateRows = keys.length
      ? await prisma.notificationTemplate.findMany({
          where: { key: { in: keys }, isActive: true },
        })
      : [];
    const templatesByKey = Object.fromEntries(templateRows.map((r) => [String(r.key), r]));

    const candidateUsers = await prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        email: { equals: invitedEmail, mode: 'insensitive' },
      },
      select: { id: true },
    });
    const candidateUserIds = Array.from(
      new Set(
        candidateUsers
          .map((u) => String(u.id || '').trim())
          .filter(Boolean)
          .concat(opts?.candidateUserId ? [String(opts.candidateUserId).trim()] : []),
      ),
    );

    if (candidateUserIds.length) {
      const pushTokens = await prisma.pushToken.findMany({ where: { userId: { in: candidateUserIds } } });
      if (pushTokens.length) {
        const pushTpl = resolveTemplateText(
          templatesByKey,
          `tech_reg_${status.toLowerCase()}_candidate_push`,
          vars,
          { subject: copy.pushTitle, body: copy.pushBody },
        );
        const pushRes = await sendExpoPushToMany(pushTokens, {
          title: pushTpl.subject || copy.pushTitle,
          body: pushTpl.body || copy.pushBody,
          data: { type: 'technician_registration_status', status },
        });
        await logTemplateNotification({
          templateId: pushTpl.templateId,
          recipient: invitedEmail,
          channel: 'PUSH',
          status: pushRes?.ok === false ? 'FAILED' : 'SENT',
          metadata: { status, sent: pushRes?.sent ?? 0, errors: pushRes?.errors ?? 0 },
        });
      }
    }

    const emailTpl = resolveTemplateText(
      templatesByKey,
      `tech_reg_${status.toLowerCase()}_candidate_email`,
      vars,
      { subject: copy.emailSubject, body: copy.emailText },
    );
    const emailText = emailTpl.body || copy.emailText;
    const emailHtml = emailTpl.templateId ? emailBodyToSimpleHtml(emailText) : copy.emailHtml;
    const emailOut = await sendTransactionalEmailWithFallback({
      to: invitedEmail,
      subject: emailTpl.subject || copy.emailSubject,
      text: emailText,
      html: emailHtml,
    }).catch((e) => {
      console.warn('[tech-reg notify] e-mail candidato:', e?.message || e);
      return { send: { ok: false, error: e?.message || String(e) }, provider: 'none' };
    });
    await logTemplateNotification({
      templateId: emailTpl.templateId,
      recipient: invitedEmail,
      channel: 'EMAIL',
      status: emailOut?.send?.ok ? 'SENT' : 'FAILED',
      metadata: {
        status,
        provider: emailOut?.provider || 'none',
        skipped: !!emailOut?.send?.skipped,
        error: emailOut?.send?.error || null,
      },
    });

    if (status === 'SUBMITTED') {
      const reviewers = await prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          role: { in: ['MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN'] },
        },
        select: { id: true },
      });
      const reviewerIds = reviewers.map((u) => u.id).filter((id) => !candidateUserIds.includes(id));
      if (reviewerIds.length) {
        const reviewTokens = await prisma.pushToken.findMany({ where: { userId: { in: reviewerIds } } });
        if (reviewTokens.length) {
          const reviewerTpl = resolveTemplateText(
            templatesByKey,
            'tech_reg_submitted_reviewer_push',
            vars,
            {
              subject: 'Nova candidatura de prestador',
              body: tenant?.name
                ? `${invitedEmail} enviou candidatura (${tenant.name}).`
                : `${invitedEmail} enviou candidatura.`,
            },
          );
          const reviewerPushRes = await sendExpoPushToMany(reviewTokens, {
            title: reviewerTpl.subject || 'Nova candidatura de prestador',
            body:
              reviewerTpl.body ||
              (tenant?.name ? `${invitedEmail} enviou candidatura (${tenant.name}).` : `${invitedEmail} enviou candidatura.`),
            data: { type: 'technician_registration_submitted', status },
          });
          await logTemplateNotification({
            templateId: reviewerTpl.templateId,
            recipient: `tenant:${tenantId}:reviewers`,
            channel: 'PUSH',
            status: reviewerPushRes?.ok === false ? 'FAILED' : 'SENT',
            metadata: { status, sent: reviewerPushRes?.sent ?? 0, errors: reviewerPushRes?.errors ?? 0 },
          });
        }
      }
    }
  } catch (e) {
    console.warn('[tech-reg notify] falha:', e?.message || e);
  }
}

/** Passo 1 com gate IA (foto de perfil separada das fotos FaceMatch). */
function isAiTechRegProfileGateFromRaw(raw) {
  const cap = raw && typeof raw === 'object' ? raw.techRegPrimaryProfileCapture : null;
  if (!cap || typeof cap !== 'object') return false;
  const ve = String(cap.validationEngine || '');
  if (!(ve === 'ai_llm_vision' || ve === 'openai_vision')) return false;
  return !!cap.validatedAt;
}

/**
 * Remove de `faceEnrollmentPhotos` entradas que são a foto de perfil (mesmo id, prefixo tp_, ou mesma URL que avatarUrl).
 * Evita mostrar o passo 1 no passo 2.
 * @returns {{ next: object, changed: boolean }}
 */
function sanitizeTechRegFaceEnrollmentPhotosIfAiProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { next: raw, changed: false };
  if (!isAiTechRegProfileGateFromRaw(raw)) return { next: raw, changed: false };
  const cap = raw.techRegPrimaryProfileCapture;
  const pid = cap && cap.photoId ? String(cap.photoId) : '';
  const av = String(raw.avatarUrl || '').trim();
  const list = normalizeFacePhotos(raw.faceEnrollmentPhotos);
  const filtered = list.filter((p) => {
    const id = String(p.id || '');
    const url = String(p.url || '').trim();
    if (id.startsWith('tp_')) return false;
    if (pid && id === pid) return false;
    if (av && url === av) return false;
    return true;
  });
  if (filtered.length === list.length) return { next: raw, changed: false };
  const next = { ...raw, faceEnrollmentPhotos: filtered };
  return { next, changed: true };
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
  const faces = normalizeFacePhotos(merged.faceEnrollmentPhotos);
  if (isAiTechRegProfileGateFromRaw(merged)) {
    const av = String(merged.avatarUrl || '').trim();
    if (!av || !av.startsWith('/uploads/tech-registration/')) {
      return 'Conclua o passo 1 (foto de perfil) antes de enviar a candidatura.';
    }
    if (faces.length < MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT) {
      return `No passo 2, envie pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT} fotos de rosto validadas em relação à foto de perfil. Atualmente: ${faces.length}.`;
    }
    const idc = merged.techRegIdDocument;
    if (!idc || typeof idc !== 'object' || !idc.faceVerifiedAt) {
      return 'Conclua o passo 3: envie o documento com foto, aguarde a validação do rosto e o preenchimento dos dados.';
    }
  } else if (faces.length < MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT) {
    return `Envie pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT} fotos nítidas do rosto para reconhecimento facial. Atualmente: ${faces.length}.`;
  }
  return null;
}

/** Bloqueia alterações de identidade facial no fluxo candidato quando o TechnicianProfile já está ACTIVE. */
async function blockLockedTechnicianIdentity(req, res, next) {
  try {
    if (await respondWithTechnicianIdentityLockIfNeeded(req, res)) return;
    next();
  } catch (e) {
    next(e);
  }
}

async function bindTechRegistrationCandidate(req, res, next) {
  try {
    const app = await prisma.technicianRegistrationApplication.findUnique({
      where: { inviteToken: req.params.token },
    });
    if (!app) return res.status(404).json({ error: 'Convite inválido.' });
    if (!req.user?.email) return res.status(401).json({ error: 'Faça login no app com o e-mail do convite.' });
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

/** Mesmo handler que POST /api/me/validate-technician-profile-photo — útil se o proxy só encaminhar bem /api/technician-registration/public/*. */
publicRouter.post(
  '/:token/validate-profile-photo',
  express.json({ limit: '10mb' }),
  authUser,
  bindTechRegistrationCandidate,
  handleTechnicianProfilePhotoAiValidate,
);

/**
 * Passo 1 — grava só a foto de perfil (não entra em faceEnrollmentPhotos).
 * Ao substituir a foto de perfil, remove arquivos antigos e zera as fotos biométricas (passo 2).
 */
publicRouter.post(
  '/:token/profile-photo',
  express.json({ limit: '15mb' }),
  authUser,
  bindTechRegistrationCandidate,
  blockLockedTechnicianIdentity,
  async (req, res) => {
    try {
      const { fileBase64, mimeType, techRegPrimaryProfileCapture: capIn } = req.body || {};
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
      if (!ext) return res.status(400).json({ error: 'Use imagem JPEG, PNG ou WebP.' });

      const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
      const oldAv = String(raw.avatarUrl || '');
      if (oldAv.startsWith(`/uploads/tech-registration/${app.id}/`)) {
        await unlinkUploadsPublicPath(oldAv);
      }
      const oldList = normalizeFacePhotos(raw.faceEnrollmentPhotos);
      for (const p of oldList) {
        const u = String(p.url || '');
        if (u.startsWith(`/uploads/tech-registration/${app.id}/`)) {
          await unlinkUploadsPublicPath(u);
        }
      }
      const oldIdDoc = raw.techRegIdDocument && raw.techRegIdDocument.attachmentUrl;
      if (oldIdDoc && String(oldIdDoc).startsWith(`/uploads/tech-registration/${app.id}/`)) {
        await unlinkUploadsPublicPath(String(oldIdDoc));
      }

      const photoId = `tp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      const fname = `${photoId}.${ext}`;
      const absDir = path.join(__dirname, '../../public/uploads/tech-registration', app.id);
      await fs.mkdir(absDir, { recursive: true });
      await fs.writeFile(path.join(absDir, fname), buf);
      const publicPath = `/uploads/tech-registration/${app.id}/${fname}`;
      const createdAt = new Date().toISOString();
      const cap = {
        validatedAt: String(capIn?.validatedAt || createdAt),
        validationEngine: capIn?.validationEngine === 'openai_vision' ? 'openai_vision' : 'ai_llm_vision',
        ...(capIn?.userMessagePtBr
          ? { userMessagePtBr: String(capIn.userMessagePtBr).trim().slice(0, 2000) }
          : {}),
        photoId,
      };
      const nextJson = {
        ...raw,
        avatarUrl: publicPath,
        techRegPrimaryProfileCapture: cap,
        faceEnrollmentPhotos: [],
        birthDate: null,
      };
      delete nextJson.techRegIdDocument;
      const pd = Array.isArray(raw.personalDocuments) ? raw.personalDocuments.map((x) => ({ ...x })) : [];
      if (oldIdDoc && pd.length) {
        const u0 = String(pd[0].attachmentUrl || '');
        if (u0 === String(oldIdDoc)) {
          pd[0] = { ...pd[0], attachmentUrl: null, attachmentMimeType: null };
        }
      }
      nextJson.personalDocuments = pd;
      await prisma.$transaction([
        prisma.technicianRegistrationApplication.update({
          where: { id: app.id },
          data: { responsesJson: nextJson },
        }),
        prisma.user.update({
          where: { id: req.user.id },
          data: { avatarUrl: publicPath },
        }),
      ]);
      res.status(201).json({
        url: publicPath,
        avatarUrl: publicPath,
        techRegPrimaryProfileCapture: cap,
        faceEnrollmentPhotos: [],
      });
    } catch (err) {
      console.error('POST tech-reg profile-photo', err);
      res.status(500).json({ error: err.message });
    }
  },
);

publicRouter.get('/:token', optionalAuthUser, async (req, res) => {
  try {
    const { token } = req.params;
    const app = await prisma.technicianRegistrationApplication.findUnique({
      where: { inviteToken: token },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!app) return res.status(404).json({ error: 'Convite inválido ou expirado.' });
    const registrationSource = app.createdByUserId ? 'panel_invite' : 'self_service';

    if (['APPROVED', 'REJECTED'].includes(app.status)) {
      return res.json({
        closed: true,
        status: app.status,
        tenantName: app.tenant?.name,
        invitedEmail: app.invitedEmail,
        registrationSource,
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
        registrationSource,
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
      select: { id: true, name: true, type: true, latitude: true, longitude: true, address: true },
      orderBy: { name: 'asc' },
    });
    let responses =
      app.responsesJson && typeof app.responsesJson === 'object' ? { ...app.responsesJson } : {};
    const { next: cleaned, changed } = sanitizeTechRegFaceEnrollmentPhotosIfAiProfile(responses);
    if (changed) {
      responses = cleaned;
      await prisma.technicianRegistrationApplication
        .update({
          where: { id: app.id },
          data: { responsesJson: responses },
        })
        .catch((e) => console.warn('[tech-reg GET] sanitize faceEnrollmentPhotos', e.message));
    }
    res.json({
      id: app.id,
      status: app.status,
      tenantName: app.tenant?.name,
      tenantId: app.tenantId,
      invitedEmail: app.invitedEmail,
      registrationSource,
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
      const patchIn = req.body.responsesJson || req.body;
      if (draftPatchTouchesLockedIdentity(patchIn) && (await respondWithTechnicianIdentityLockIfNeeded(req, res))) {
        return;
      }
      let next = mergeJsonResponses(app.responsesJson, patchIn);
      const saniDraft = sanitizeTechRegFaceEnrollmentPhotosIfAiProfile(next);
      if (saniDraft.changed) next = saniDraft.next;
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
  blockLockedTechnicianIdentity,
  async (req, res) => {
    try {
      const app = req.techRegApp;
      if (['APPROVED', 'REJECTED'].includes(app.status)) {
        return res.status(400).json({ error: 'Esta candidatura já foi concluída.' });
      }
      const errMsg = validateSubmitPayload(app, req.body);
      if (errMsg) return res.status(400).json({ error: errMsg });

      const identity = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { password: true },
      });
      if (!identity?.password) {
        return res.status(400).json({ error: 'Conta sem credencial de senha válida.' });
      }
      if (!hasRecentAppSessionForTechRegSubmit(req.user)) {
        const otpCheck = verifyTechRegSubmitOtpChallenge({
          app,
          reqUser: req.user,
          challengeToken: req.body?.otpChallengeToken,
          otpCode: req.body?.otpCode,
        });
        if (!otpCheck.ok) {
          if (otpCheck.code === 'OTP_REQUIRED') {
            const issued = await issueTechRegSubmitOtpChallenge({ app, reqUser: req.user });
            return res.status(400).json({
              error: 'Enviamos um código de confirmação para seu e-mail. Informe o código para concluir o envio.',
              code: 'RECENT_LOGIN_OTP_REQUIRED',
              challengeToken: issued.challengeToken,
              otpDigits: 6,
              expiresInSec: TECH_REG_SUBMIT_OTP_TTL_SECONDS,
            });
          }
          return res.status(400).json({
            error: otpCheck.error,
            code: otpCheck.code,
          });
        }
      }

      const merged = mergeJsonResponses(app.responsesJson, req.body.responsesJson || req.body.responses || {});
      if (!merged.technician || typeof merged.technician !== 'object') merged.technician = {};
      if (!merged.technician.workScheduleJson || typeof merged.technician.workScheduleJson !== 'object') {
        merged.technician.workScheduleJson = defaultEmptySchedule();
      }
      if (!Array.isArray(merged.technician.serviceLocationIds)) merged.technician.serviceLocationIds = [];
      merged.technician.serviceCoverageGeoJson = normalizeServiceCoverageGeo(
        merged.technician.serviceCoverageGeoJson
      );
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
      await notifyTechRegistrationStatus({
        tenantId: app.tenantId,
        invitedEmail: merged.email || app.invitedEmail,
        candidateUserId: req.user.id,
        status: 'SUBMITTED',
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

async function readTechRegProfileBuffer(app) {
  const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
  const url = String(raw.avatarUrl || '').trim();
  const prefix = `/uploads/tech-registration/${app.id}/`;
  if (!url.startsWith(prefix)) {
    return { error: 'Faça primeiro o passo 1 (foto de perfil validada por IA).' };
  }
  const rel = url.replace(/^\/uploads\//, '');
  const abs = path.join(__dirname, '../../public/uploads', ...rel.split('/'));
  try {
    const profileBuf = await fs.readFile(abs);
    if (!profileBuf || profileBuf.length < 64) {
      return { error: 'Arquivo da foto de perfil não encontrado. Refaça o passo 1.' };
    }
    return { buf: profileBuf };
  } catch {
    return { error: 'Não foi possível ler a foto de perfil. Refaça o passo 1.' };
  }
}

publicRouter.post(
  '/:token/face-enrollment',
  express.json({ limit: '15mb' }),
  authUser,
  bindTechRegistrationCandidate,
  blockLockedTechnicianIdentity,
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

    const freshApp = await prisma.technicianRegistrationApplication.findUnique({
      where: { id: app.id },
    });
    if (!freshApp) return res.status(404).json({ error: 'Candidatura não encontrada.' });
    let workingRaw =
      freshApp.responsesJson && typeof freshApp.responsesJson === 'object' ? freshApp.responsesJson : {};
    const stripProf = sanitizeTechRegFaceEnrollmentPhotosIfAiProfile(workingRaw);
    if (stripProf.changed) {
      workingRaw = stripProf.next;
      await prisma.technicianRegistrationApplication.update({
        where: { id: freshApp.id },
        data: { responsesJson: workingRaw },
      });
    }

    if (isAiTechRegProfileGateFromRaw(workingRaw)) {
      const prof = await readTechRegProfileBuffer({ ...freshApp, responsesJson: workingRaw });
      if (prof.error) {
        return res.status(400).json({ error: prof.error, code: 'PROFILE_REQUIRED' });
      }
      const v = await verifyTechRegEnrollmentAgainstProfile(prisma, freshApp.tenantId, prof.buf, buf);
      if (!v.ok) {
        const st =
          v.code === 'NO_VISION_INTEGRATION' ||
          v.code === 'NO_VERIFICATION_KEY' ||
          v.code === 'UNSUPPORTED_ENGINE'
            ? 503
            : 400;
        return res.status(st).json({ error: v.message, code: v.code });
      }
    }

    const list = normalizeFacePhotos(workingRaw.faceEnrollmentPhotos);
    if (list.length >= MAX_FACE_ENROLLMENT_PHOTOS) {
      return res.status(400).json({ error: `Limite de ${MAX_FACE_ENROLLMENT_PHOTOS} fotos.` });
    }

    const photoId = `fe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const fname = `${photoId}.${ext}`;
    const absDir = path.join(__dirname, '../../public/uploads/tech-registration', freshApp.id);
    await fs.mkdir(absDir, { recursive: true });
    await fs.writeFile(path.join(absDir, fname), buf);
    const publicPath = `/uploads/tech-registration/${freshApp.id}/${fname}`;
    const createdAt = new Date().toISOString();
    const entry = {
      id: photoId,
      url: publicPath,
      mimeType: mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      createdAt,
    };
    const next = [...list, entry];
    let nextJson = { ...workingRaw, faceEnrollmentPhotos: next };
    const saniOut = sanitizeTechRegFaceEnrollmentPhotosIfAiProfile(nextJson);
    if (saniOut.changed) nextJson = saniOut.next;
    await prisma.technicianRegistrationApplication.update({
      where: { id: freshApp.id },
      data: { responsesJson: nextJson },
    });
    res.status(201).json({
      photo: entry,
      photos: normalizeFacePhotos(nextJson.faceEnrollmentPhotos),
    });
  } catch (err) {
    console.error('POST tech-reg face', err);
    res.status(500).json({
      error: 'Não foi possível processar a foto neste momento. Tente de novo em instantes.',
      code: 'SERVER_ERROR',
    });
  }
  }
);

publicRouter.delete(
  '/:token/face-enrollment/:photoId',
  authUser,
  bindTechRegistrationCandidate,
  blockLockedTechnicianIdentity,
  async (req, res) => {
  try {
    const { photoId } = req.params;
    const app = req.techRegApp;
    const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
    const cap = raw.techRegPrimaryProfileCapture;
    const profilePid =
      cap && typeof cap === 'object' && cap.photoId
        ? String(cap.photoId)
        : '';
    if (profilePid && String(photoId) === profilePid) {
      return res.status(400).json({
        error: 'A foto de perfil do passo 1 não pode ser removida por aqui. Use o fluxo de cadastro para alterar o passo 1.',
        code: 'PROFILE_PHOTO_PROTECTED',
      });
    }
    if (String(photoId).startsWith('tp_')) {
      return res.status(400).json({
        error: 'A foto de perfil (passo 1) não pode ser removida por esta rota.',
        code: 'PROFILE_PHOTO_PROTECTED',
      });
    }
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
    let nextJson = { ...raw, faceEnrollmentPhotos: next };
    const saniDel = sanitizeTechRegFaceEnrollmentPhotosIfAiProfile(nextJson);
    if (saniDel.changed) nextJson = saniDel.next;
    await prisma.technicianRegistrationApplication.update({
      where: { id: app.id },
      data: { responsesJson: nextJson },
    });
    res.json({ photos: normalizeFacePhotos(nextJson.faceEnrollmentPhotos) });
  } catch (err) {
    console.error('DELETE tech-reg face', err);
    res.status(500).json({ error: err.message });
  }
});

function mergeTechRegIdDocumentResponses(raw, publicPath, mimeType, extracted, faceVerifiedAt) {
  const ocrAt = new Date().toISOString();
  const techRegIdDocument = {
    attachmentUrl: publicPath,
    mimeType: mimeType || null,
    faceVerifiedAt,
    faceMatchProvider: 'openai',
    ocrAt,
    ocrProvider: 'openai',
    extracted: {
      docType: extracted.docType,
      documentNumber: extracted.documentNumber,
      issueDate: extracted.issueDate,
      expiryDate: extracted.expiryDate,
      issuingBody: extracted.issuingBody,
      fullName: extracted.fullName,
      birthDate: extracted.birthDate,
    },
  };
  const base = raw && typeof raw === 'object' ? { ...raw } : {};
  const prev = Array.isArray(base.personalDocuments) ? base.personalDocuments.map((x) => ({ ...x })) : [];
  let row0;
  if (prev.length) {
    row0 = { ...prev[0] };
  } else {
    row0 = {
      id: `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      notes: '',
      locationIds: [],
    };
  }
  if (!row0.id) row0.id = `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  row0.docType = extracted.docType || row0.docType || 'OUTRO';
  row0.identifier = extracted.documentNumber || row0.identifier || '';
  row0.validFrom = extracted.issueDate || row0.validFrom || '';
  row0.validTo = extracted.expiryDate || row0.validTo || '';
  row0.issuingBody = extracted.issuingBody || row0.issuingBody || '';
  row0.attachmentUrl = publicPath;
  row0.attachmentMimeType = mimeType || null;
  const nextPersonal = [row0, ...prev.slice(1)];
  const fullName = String(extracted.fullName || '').trim();
  return {
    ...base,
    techRegIdDocument,
    ...(fullName ? { name: fullName } : {}),
    birthDate: extracted.birthDate || base.birthDate || null,
    personalDocuments: nextPersonal,
  };
}

/**
 * Passo 3 (fluxo IA): documento com foto — comparação rosto documento × perfil (OpenAI visão, mesmo motor do passo 1) + OCR e preenchimento de dados.
 */
publicRouter.post(
  '/:token/id-document',
  express.json({ limit: '15mb' }),
  authUser,
  bindTechRegistrationCandidate,
  blockLockedTechnicianIdentity,
  async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body || {};
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
      if (buf.length > MAX_DOC_ATTACHMENT_BYTES) {
        return res.status(400).json({ error: 'Arquivo muito grande (máx. 10 MB).' });
      }
      const ext = detectDocExtFromBuffer(buf, mimeType);
      if (ext === 'pdf') {
        return res.status(400).json({
          error:
            'Neste passo envie uma foto do documento (JPEG, PNG ou WebP). Assim conseguimos comparar o rosto na imagem com a sua foto de perfil.',
          code: 'ID_DOC_IMAGE_REQUIRED',
        });
      }
      if (!ext || ext === 'heic') {
        return res.status(400).json({
          error:
            ext === 'heic'
              ? 'HEIC não é suportado. Use JPEG ou PNG.'
              : 'Use imagem JPEG, PNG ou WebP do documento.',
        });
      }

      const freshApp = await prisma.technicianRegistrationApplication.findUnique({
        where: { id: app.id },
      });
      if (!freshApp) return res.status(404).json({ error: 'Candidatura não encontrada.' });
      let workingRaw =
        freshApp.responsesJson && typeof freshApp.responsesJson === 'object' ? freshApp.responsesJson : {};

      if (!isAiTechRegProfileGateFromRaw(workingRaw)) {
        return res.status(400).json({
          error: 'Este passo só está disponível no fluxo com foto de perfil validada por IA.',
          code: 'ID_DOC_FLOW_MISMATCH',
        });
      }

      const faces = normalizeFacePhotos(workingRaw.faceEnrollmentPhotos);
      if (faces.length < MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT) {
        return res.status(400).json({
          error: `Conclua o passo 2 antes: envie pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS_FOR_SUBMIT} fotos biométricas.`,
          code: 'FACE_STEP_REQUIRED',
        });
      }

      const prof = await readTechRegProfileBuffer({ ...freshApp, responsesJson: workingRaw });
      if (prof.error) {
        return res.status(400).json({ error: prof.error, code: 'PROFILE_REQUIRED' });
      }

      let faceCheck;
      try {
        faceCheck = await verifyDocumentFaceMatchesProfileOpenAi(prof.buf, buf);
      } catch (e) {
        console.error(
          '[tech-reg id-document] face match OpenAI',
          e?.code || e?.name,
          e?.status,
          e?.message || e
        );
        if (e.code === 'NO_OPENAI_KEY') {
          return res.status(503).json({
            error:
              'Comparação do documento com a foto de perfil requer OpenAI configurada (integração no painel ou OPENAI_API_KEY).',
            code: 'NO_OPENAI_KEY',
          });
        }
        return res.status(503).json({
          error:
            'Não foi possível comparar o documento com a foto de perfil agora. Tente de novo em instantes.',
          code: 'FACE_VERIFY_FAILED',
        });
      }
      if (!faceCheck.ok) {
        return res.status(400).json({ error: faceCheck.message, code: faceCheck.code });
      }

      let extracted;
      try {
        const addr = workingRaw.addressJson && typeof workingRaw.addressJson === 'object' ? workingRaw.addressJson : {};
        const countryCode = String(addr.countryCode || 'BR').trim() || 'BR';
        extracted = await extractIdDocumentWithOpenAi(buf, { countryCode });
      } catch (e) {
        console.error('[tech-reg id-document] OCR', e);
        if (e.code === 'NO_OPENAI_KEY') {
          return res.status(503).json({
            error:
              'Leitura automática do documento indisponível: configure a integração OpenAI no servidor ou OPENAI_API_KEY.',
            code: 'NO_OPENAI_KEY',
          });
        }
        return res.status(500).json({
          error: 'Não foi possível ler os dados do documento. Tente outra foto mais nítida.',
          code: 'OCR_FAILED',
        });
      }

      const prefix = `/uploads/tech-registration/${freshApp.id}/`;
      const oldId = workingRaw.techRegIdDocument && workingRaw.techRegIdDocument.attachmentUrl;
      if (oldId && String(oldId).startsWith(prefix)) {
        await unlinkUploadsPublicPath(String(oldId));
      }

      const fname = `idr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const absDir = path.join(__dirname, '../../public/uploads/tech-registration', freshApp.id);
      await fs.mkdir(absDir, { recursive: true });
      await fs.writeFile(path.join(absDir, fname), buf);
      const publicPath = `/uploads/tech-registration/${freshApp.id}/${fname}`;
      const faceVerifiedAt = new Date().toISOString();
      const mimeOut = mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const nextJson = mergeTechRegIdDocumentResponses(workingRaw, publicPath, mimeOut, extracted, faceVerifiedAt);

      await prisma.technicianRegistrationApplication.update({
        where: { id: freshApp.id },
        data: { responsesJson: nextJson },
      });

      res.status(201).json({
        ok: true,
        responsesJson: nextJson,
        techRegIdDocument: nextJson.techRegIdDocument,
        extracted: nextJson.techRegIdDocument.extracted,
      });
    } catch (err) {
      console.error('POST tech-reg id-document', err);
      res.status(500).json({
        error: 'Não foi possível processar o documento. Tente novamente em instantes.',
        code: 'SERVER_ERROR',
      });
    }
  }
);

function docMimeToExt(mt) {
  const m = String(mt || '').toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return null;
}

function detectDocExtFromBuffer(buf, mimeType) {
  let ext = docMimeToExt(mimeType);
  if (ext) return ext;
  if (buf && buf.length > 4 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'pdf';
  if (buf && buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf && buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  return null;
}

async function unlinkUploadsPublicPath(publicPath) {
  if (!publicPath || !String(publicPath).startsWith('/uploads/')) return;
  const rel = String(publicPath).replace(/^\/uploads\//, '');
  const abs = path.join(__dirname, '../../public/uploads', ...rel.split('/'));
  try {
    await fs.unlink(abs);
  } catch {
    /* ok */
  }
}

function findDocAttachmentRow(raw, kind, rowId) {
  const k = String(kind || '').toLowerCase();
  const rid = String(rowId || '').trim();
  if (k === 'personal') {
    const arr = Array.isArray(raw?.personalDocuments) ? raw.personalDocuments : [];
    const row = arr.find((r) => r && r.id === rid);
    if (!row) return { error: 'Linha de documento pessoal não encontrada.' };
    return { oldUrl: row.attachmentUrl || null };
  }
  if (k === 'professional') {
    const tech = raw?.technician && typeof raw.technician === 'object' ? raw.technician : {};
    const arr = Array.isArray(tech.professionalDocuments) ? tech.professionalDocuments : [];
    const row = arr.find((r) => r && r.id === rid);
    if (!row) return { error: 'Linha de documento profissional não encontrada.' };
    return { oldUrl: row.attachmentUrl || null };
  }
  return { error: 'Tipo inválido (use personal ou professional).' };
}

function patchDocAttachmentInResponsesJson(raw, kind, rowId, publicPath, mimeType) {
  const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  if (kind === 'personal') {
    const arr = Array.isArray(base.personalDocuments) ? base.personalDocuments.map((x) => ({ ...x })) : [];
    const i = arr.findIndex((r) => r && r.id === rowId);
    if (i < 0) return { error: 'Linha de documento pessoal não encontrada.' };
    const oldUrl = arr[i].attachmentUrl;
    arr[i] = { ...arr[i], attachmentUrl: publicPath, attachmentMimeType: mimeType || null };
    base.personalDocuments = arr;
    return { nextJson: base, oldUrl };
  }
  if (kind === 'professional') {
    const tech = typeof base.technician === 'object' && base.technician ? { ...base.technician } : {};
    const arr = Array.isArray(tech.professionalDocuments)
      ? tech.professionalDocuments.map((x) => ({ ...x }))
      : [];
    const i = arr.findIndex((r) => r && r.id === rowId);
    if (i < 0) return { error: 'Linha de documento profissional não encontrada.' };
    const oldUrl = arr[i].attachmentUrl;
    arr[i] = { ...arr[i], attachmentUrl: publicPath, attachmentMimeType: mimeType || null };
    tech.professionalDocuments = arr;
    base.technician = tech;
    return { nextJson: base, oldUrl };
  }
  return { error: 'Tipo inválido (use personal ou professional).' };
}

publicRouter.post(
  '/:token/document-attachment',
  express.json({ limit: '15mb' }),
  authUser,
  bindTechRegistrationCandidate,
  async (req, res) => {
    try {
      const { fileBase64, mimeType, kind, rowId } = req.body || {};
      const app = req.techRegApp;
      if (['APPROVED', 'REJECTED'].includes(app.status)) {
        return res.status(400).json({ error: 'Candidatura encerrada.' });
      }
      const k = String(kind || '').toLowerCase();
      if (k !== 'personal' && k !== 'professional') {
        return res.status(400).json({ error: 'kind deve ser personal ou professional.' });
      }
      const rid = String(rowId || '').trim();
      if (!rid) return res.status(400).json({ error: 'rowId é obrigatório.' });
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
        return res.status(400).json({ error: 'Arquivo muito grande (máx. 10 MB).' });
      }
      const ext = detectDocExtFromBuffer(buf, mimeType);
      if (!ext) {
        return res.status(400).json({ error: 'Use imagem JPEG, PNG, WebP ou PDF.' });
      }

      const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
      const rowCheck = findDocAttachmentRow(raw, k, rid);
      if (rowCheck.error) return res.status(400).json({ error: rowCheck.error });

      const fname = `doc-${rid}-${Date.now().toString(36)}.${ext}`;
      const absDir = path.join(__dirname, '../../public/uploads/tech-registration', app.id);
      await fs.mkdir(absDir, { recursive: true });
      await fs.writeFile(path.join(absDir, fname), buf);
      const publicPath = `/uploads/tech-registration/${app.id}/${fname}`;

      const resolvedMime =
        mimeType || (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`);
      const patched2 = patchDocAttachmentInResponsesJson(raw, k, rid, publicPath, resolvedMime);
      if (patched2.error) return res.status(400).json({ error: patched2.error });
      if (patched2.oldUrl && String(patched2.oldUrl).includes(`/tech-registration/${app.id}/`)) {
        await unlinkUploadsPublicPath(patched2.oldUrl);
      }

      await prisma.technicianRegistrationApplication.update({
        where: { id: app.id },
        data: { responsesJson: patched2.nextJson },
      });
      res.status(201).json({
        attachmentUrl: publicPath,
        responsesJson: patched2.nextJson,
      });
    } catch (err) {
      console.error('POST tech-reg document-attachment', err);
      res.status(500).json({ error: err.message });
    }
  }
);

publicRouter.delete(
  '/:token/document-attachment/:kind/:rowId',
  authUser,
  bindTechRegistrationCandidate,
  async (req, res) => {
    try {
      const app = req.techRegApp;
      if (['APPROVED', 'REJECTED'].includes(app.status)) {
        return res.status(400).json({ error: 'Candidatura encerrada.' });
      }
      const k = String(req.params.kind || '').toLowerCase();
      const rowId = String(req.params.rowId || '').trim();
      if (k !== 'personal' && k !== 'professional') {
        return res.status(400).json({ error: 'Tipo inválido.' });
      }
      const raw = app.responsesJson && typeof app.responsesJson === 'object' ? app.responsesJson : {};
      const base = { ...raw };
      let oldUrl = null;
      if (k === 'personal') {
        const arr = Array.isArray(base.personalDocuments) ? base.personalDocuments.map((x) => ({ ...x })) : [];
        const i = arr.findIndex((r) => r && r.id === rowId);
        if (i < 0) return res.status(404).json({ error: 'Linha não encontrada.' });
        oldUrl = arr[i].attachmentUrl;
        arr[i] = { ...arr[i], attachmentUrl: null, attachmentMimeType: null };
        base.personalDocuments = arr;
      } else {
        const tech = typeof base.technician === 'object' && base.technician ? { ...base.technician } : {};
        const arr = Array.isArray(tech.professionalDocuments)
          ? tech.professionalDocuments.map((x) => ({ ...x }))
          : [];
        const i = arr.findIndex((r) => r && r.id === rowId);
        if (i < 0) return res.status(404).json({ error: 'Linha não encontrada.' });
        oldUrl = arr[i].attachmentUrl;
        arr[i] = { ...arr[i], attachmentUrl: null, attachmentMimeType: null };
        tech.professionalDocuments = arr;
        base.technician = tech;
      }
      if (oldUrl && String(oldUrl).includes(`/tech-registration/${app.id}/`)) {
        await unlinkUploadsPublicPath(oldUrl);
      }
      await prisma.technicianRegistrationApplication.update({
        where: { id: app.id },
        data: { responsesJson: base },
      });
      res.json({ ok: true, responsesJson: base });
    } catch (err) {
      console.error('DELETE tech-reg document-attachment', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── Admin / gestor ──────────────────────────────────────────────────────────

/**
 * Utilizadores com TechnicianProfile PENDING mas sem candidatura de cadastro em curso
 * (o que explica «Prestador pendente» em Utilizadores sem linha em Cadastro de prestadores).
 */
async function listOrphanPendingTechnicianProfiles(tenantFilter, qSearch) {
  const q = qSearch != null ? String(qSearch).trim().slice(0, 200) : '';
  const userWhere = {
    technicianProfile: { status: 'PENDING' },
    ...(tenantFilter ? { tenantId: tenantFilter } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const users = await prisma.user.findMany({
    where: userWhere,
    take: 150,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      tenantId: true,
      updatedAt: true,
      tenant: { select: { id: true, name: true } },
    },
  });
  if (!users.length) return [];

  const tenantIds = [...new Set(users.map((u) => u.tenantId))];

  const blockingStatuses = ['INVITED', 'DRAFT', 'SUBMITTED', 'NEEDS_REVISION', 'APPROVED'];
  const existingApps = await prisma.technicianRegistrationApplication.findMany({
    where: {
      tenantId: { in: tenantIds },
      status: { in: blockingStatuses },
    },
    select: { tenantId: true, invitedEmail: true },
  });
  const key = (tid, em) => `${tid}::${String(em).toLowerCase()}`;
  const blocked = new Set(existingApps.map((a) => key(a.tenantId, a.invitedEmail)));

  return users
    .filter((u) => !blocked.has(key(u.tenantId, u.email)))
    .map((u) => ({
      kind: 'orphan_profile',
      id: null,
      applicationId: null,
      orphanUserId: u.id,
      tenantId: u.tenantId,
      tenantName: u.tenant?.name,
      invitedEmail: u.email,
      candidateName: u.name,
      status: 'PERFIL_SEM_CANDIDATURA',
      submittedAt: null,
      resolvedAt: null,
      createdAt: null,
      updatedAt: u.updatedAt,
      createdUserId: null,
      createdUserEmail: null,
    }));
}

adminRouter.get('/', async (req, res) => {
  try {
    const { status, tenantId: qTenant, includeOrphans, q: qRaw } = req.query;
    const tenantFilter = resolveScopedTenantId(req.authorization, qTenant || null);

    const statusStr = status ? String(status) : '';
    const qSearch = qRaw != null ? String(qRaw).trim().slice(0, 200) : '';
    /** Com filtro por estado de candidatura, não misturar filas diferentes. */
    const wantOrphans =
      includeOrphans !== '0' &&
      (!statusStr || statusStr === 'PERFIL_SEM_CANDIDATURA' || statusStr === '__ORPHAN__');

    if (statusStr === 'PERFIL_SEM_CANDIDATURA' || statusStr === '__ORPHAN__') {
      const orphans = await listOrphanPendingTechnicianProfiles(tenantFilter, qSearch);
      return res.json({ data: orphans });
    }

    const whereParts = [];
    if (tenantFilter) whereParts.push({ tenantId: tenantFilter });
    if (statusStr) whereParts.push({ status: statusStr });
    if (qSearch) {
      whereParts.push({
        OR: [
          { invitedEmail: { contains: qSearch, mode: 'insensitive' } },
          { tenant: { name: { contains: qSearch, mode: 'insensitive' } } },
        ],
      });
    }
    const where = whereParts.length === 0 ? {} : whereParts.length === 1 ? whereParts[0] : { AND: whereParts };

    const rows = await prisma.technicianRegistrationApplication.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        tenant: { select: { id: true, name: true } },
        createdUser: { select: { id: true, email: true, name: true } },
      },
    });
    const mapped = rows.map((r) => ({
      kind: 'application',
      id: r.id,
      applicationId: r.id,
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
      orphanUserId: null,
      candidateName: null,
    }));

    let data = mapped;
    if (wantOrphans && !statusStr) {
      const orphans = await listOrphanPendingTechnicianProfiles(tenantFilter, qSearch);
      data = [...orphans, ...mapped];
    }

    res.json({ data });
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
    const tenantId = resolveScopedTenantId(req.authorization, bodyTenant || null);
    if (!tenantId) return res.status(400).json({ error: 'tenantId é obrigatório (ou inicie sessão no contexto do tenant).' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant não encontrado.' });

    const em = String(email).trim().toLowerCase();
    /** O convite é sempre para alguém que já tem User neste tenant (preenche o formulário com a mesma sessão). */
    const userInTenant = await prisma.user.findFirst({
      where: { tenantId, email: em },
      select: { id: true },
    });
    if (!userInTenant) {
      const elsewhere = await prisma.user.findFirst({ where: { email: em }, select: { id: true, tenantId: true } });
      if (elsewhere) {
        return res.status(400).json({
          error:
            'Este e-mail existe em outra organização, mas não há usuário com este e-mail neste tenant. Confirme o tenant ou o e-mail.',
        });
      }
      return res.status(400).json({
        error:
          'Este e-mail ainda não tem conta neste tenant. O prestador deve criar conta no app (nesta organização) com este e-mail antes do convite.',
      });
    }

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
        responsesJson: initialTechRegistrationResponsesJson(em),
        createdByUserId,
        candidateUserId: userInTenant.id,
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
          metadata: auditContextMetadata(req, { applicationId: app.id, targetTenantId: tenantId }),
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

    let emailInfo = { sent: false, skipped: true, detail: null, provider: 'none' };
    try {
      const { send, provider } = await sendTransactionalEmailWithFallback({
        to: { email: em },
        subject: `Convite BrSpark — cadastro de prestador (${tenant.name})`,
        text: textBody,
        html: htmlBody,
      });
      if (send.skipped) {
        emailInfo = { sent: false, skipped: true, detail: send.reason || null, provider };
      } else if (send.ok) {
        emailInfo = { sent: true, skipped: false, detail: null, provider };
      } else {
        emailInfo = { sent: false, skipped: false, detail: send.error || 'Falha no envio.', provider };
        console.error('[tech-reg invite] envio:', send.error, 'provider:', provider);
      }
    } catch (e) {
      emailInfo = { sent: false, skipped: false, detail: e.message || String(e), provider: 'none' };
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
      select: { id: true, name: true, type: true, latitude: true, longitude: true, address: true },
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
    await notifyTechRegistrationStatus({
      tenantId: app.tenantId,
      invitedEmail: app.invitedEmail,
      candidateUserId: app.candidateUserId,
      status: 'NEEDS_REVISION',
      revisionNote: message,
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
    await mirrorApprovedLegacyRegistrationToProviderNetwork(prisma, {
      tenantId: app.tenantId,
      userId: user.id,
      technician:
        app.responsesJson && typeof app.responsesJson === 'object'
          ? app.responsesJson.technician
          : null,
    }).catch((e) => {
      console.warn('[provider-first] mirror legacy approval failed:', e?.message || e);
    });
    try {
      await syncComprefaceGalleryAfterUserChange(prisma, user.id, req, 'tech_reg_approve');
    } catch (e) {
      console.warn('[tech-reg] FaceMatch após aprovação', e);
    }
    await notifyTechRegistrationStatus({
      tenantId: app.tenantId,
      invitedEmail: app.invitedEmail,
      candidateUserId: app.candidateUserId || user.id,
      status: 'APPROVED',
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId: app.tenantId,
          action: 'TECH_REGISTRATION_APPROVED',
          resource: user.email,
          category: 'ADMIN',
          metadata: auditContextMetadata(req, {
            applicationId: app.id,
            userId: user.id,
            targetTenantId: app.tenantId,
            targetUserId: user.id,
          }),
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
    await notifyTechRegistrationStatus({
      tenantId: app.tenantId,
      invitedEmail: app.invitedEmail,
      candidateUserId: app.candidateUserId,
      status: 'REJECTED',
      reason,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST tech-reg reject', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { publicRouter, adminRouter };
