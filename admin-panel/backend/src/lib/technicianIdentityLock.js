'use strict';

const prisma = require('../db');

/** Chaves de identidade biométrica no rascunho da candidatura — não editáveis pelo app após habilitação. */
const DRAFT_IDENTITY_KEYS = [
  'avatarUrl',
  'faceEnrollmentPhotos',
  'techRegPrimaryProfileCapture',
  'techRegIdDocument',
  'birthDate',
];

/** Com perfil técnico ACTIVE + janela de rematrícula: o app pode alterar só estas chaves no rascunho. */
const REENROLLMENT_DRAFT_IDENTITY_KEYS = new Set([
  'avatarUrl',
  'faceEnrollmentPhotos',
  'techRegPrimaryProfileCapture',
]);

/** Nunca alteráveis pelo app quando o prestador já está ACTIVE. */
const FORBIDDEN_IDENTITY_KEYS_WHEN_TECH_ACTIVE = new Set(['birthDate', 'techRegIdDocument']);

/**
 * Prestador com `TechnicianProfile.status === ACTIVE` (habilitado): não altera foto de perfil nem base
 * de reconhecimento pelo app nem pelo fluxo de candidatura autenticado — só pelo painel admin,
 * exceto durante `faceReenrollmentUntil`.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isTechnicianIdentityLockedForUserId(userId) {
  if (!userId) return false;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { technicianProfile: { select: { status: true } } },
  });
  return String(row?.technicianProfile?.status || '').toUpperCase() === 'ACTIVE';
}

/**
 * Janela aberta: ACTIVE e `faceReenrollmentUntil` no futuro.
 * @param {string} userId
 */
async function isFaceReenrollmentWindowOpenForUserId(userId) {
  if (!userId) return false;
  const row = await prisma.technicianProfile.findUnique({
    where: { userId: String(userId).trim() },
    select: { status: true, faceReenrollmentUntil: true },
  });
  if (!row || String(row.status || '').toUpperCase() !== 'ACTIVE') return false;
  if (!row.faceReenrollmentUntil) return false;
  return new Date(row.faceReenrollmentUntil).getTime() > Date.now();
}

/**
 * @param {unknown} patch — `responsesJson` ou corpo parcial do PATCH draft
 */
function draftPatchTouchesLockedIdentity(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  for (const k of DRAFT_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) return true;
  }
  return false;
}

/**
 * Com ACTIVE: alteração a documento / data de nascimento continua proibida mesmo na janela.
 */
function draftPatchTouchesForbiddenIdentityWhenTechActive(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  for (const k of FORBIDDEN_IDENTITY_KEYS_WHEN_TECH_ACTIVE) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) return true;
  }
  return false;
}

/**
 * Com ACTIVE + janela: só permite tocar em avatar / fotos biométricas / captura passo 1.
 */
function draftPatchTouchesIdentityOutsideReenrollment(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  for (const k of DRAFT_IDENTITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    if (REENROLLMENT_DRAFT_IDENTITY_KEYS.has(k)) continue;
    return true;
  }
  return false;
}

const TECH_IDENTITY_LOCKED_BODY = {
  error:
    'A sua conta de prestador já está ativa. A foto de perfil, a matrícula facial e o documento de identidade do cadastro só podem ser alterados pela organização no painel administrativo.',
  code: 'TECH_IDENTITY_LOCKED',
};

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<boolean>} true se já enviou 403 (bloqueado)
 */
async function respondWithTechnicianIdentityLockIfNeeded(req, res) {
  if (!(await isTechnicianIdentityLockedForUserId(req.user.id))) return false;
  res.status(403).json(TECH_IDENTITY_LOCKED_BODY);
  return true;
}

/**
 * Bloqueio de identidade no fluxo candidato: com `allowReenrollmentRoutes`, rotas de foto biométrica
 * / perfil passam se a janela de rematrícula estiver aberta.
 * @param {{ allowReenrollmentRoutes?: boolean }} opts
 */
function blockLockedTechnicianIdentity(opts = {}) {
  const allowRe = opts.allowReenrollmentRoutes === true;
  return async function blockLockedTechnicianIdentityMw(req, res, next) {
    try {
      if (!(await isTechnicianIdentityLockedForUserId(req.user.id))) {
        next();
        return;
      }
      if (allowRe && (await isFaceReenrollmentWindowOpenForUserId(req.user.id))) {
        next();
        return;
      }
      res.status(403).json(TECH_IDENTITY_LOCKED_BODY);
    } catch (e) {
      next(e);
    }
  };
}

module.exports = {
  DRAFT_IDENTITY_KEYS,
  isTechnicianIdentityLockedForUserId,
  isFaceReenrollmentWindowOpenForUserId,
  draftPatchTouchesLockedIdentity,
  draftPatchTouchesForbiddenIdentityWhenTechActive,
  draftPatchTouchesIdentityOutsideReenrollment,
  TECH_IDENTITY_LOCKED_BODY,
  respondWithTechnicianIdentityLockIfNeeded,
  blockLockedTechnicianIdentity,
};
