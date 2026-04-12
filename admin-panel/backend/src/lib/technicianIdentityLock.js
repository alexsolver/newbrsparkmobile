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

/**
 * Prestador com `TechnicianProfile.status === ACTIVE` (habilitado): não altera foto de perfil nem base
 * de reconhecimento pelo app nem pelo fluxo de candidatura autenticado — só pelo painel admin.
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
 * @param {unknown} patch — `responsesJson` ou corpo parcial do PATCH draft
 */
function draftPatchTouchesLockedIdentity(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  for (const k of DRAFT_IDENTITY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) return true;
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

module.exports = {
  isTechnicianIdentityLockedForUserId,
  draftPatchTouchesLockedIdentity,
  TECH_IDENTITY_LOCKED_BODY,
  respondWithTechnicianIdentityLockIfNeeded,
};
