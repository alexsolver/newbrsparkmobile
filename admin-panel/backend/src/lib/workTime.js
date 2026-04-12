'use strict';

const prisma = require('../db');

const WORK_TIME_FLAG_KEY = 'work_time';

/** Contas com papel `USER` = cliente final no tenant; não usam ponto. Demais papéis podem, se habilitados. */
function canAccountAccessWorkTime(role) {
  return String(role || '').toUpperCase() !== 'USER';
}

function normalizeFacePhotos(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((p) => p && typeof p === 'object' && p.id && p.url);
  return [];
}

/**
 * @param {import('@prisma/client').User} user
 */
function faceEnrollmentOk(user) {
  const photos = normalizeFacePhotos(user.faceEnrollmentPhotos);
  if (photos.length === 0) return false;
  const s = user.comprefaceRecognitionSync;
  if (!s || typeof s !== 'object') return false;
  return String(s.status || '') === 'synced';
}

/**
 * Flag efetiva work_time (global + override tenant), alinhado a GET /api/flags.
 * @param {string} tenantId
 */
async function isWorkTimeFeatureFlagEnabled(tenantId) {
  const global = await prisma.featureFlag.findFirst({
    where: { key: WORK_TIME_FLAG_KEY, tenantId: null },
  });
  const gEnabled = global ? !!global.enabled : true;
  if (!tenantId) return gEnabled;
  const over = await prisma.featureFlag.findFirst({
    where: { key: WORK_TIME_FLAG_KEY, tenantId },
  });
  if (over) return !!over.enabled;
  return gEnabled;
}

const DEFAULT_SETTINGS = {
  moduleEnabled: false,
  requireFaceOnEveryPunch: true,
  requireGpsOnEveryPunch: true,
  requireResolvedAddress: true,
  maxClockDriftSeconds: 300,
  minGpsAccuracyMeters: null,
  employeeNoticeMarkdown: null,
  consentVersion: null,
};

/**
 * Garante linha WorkTimeSettings para o tenant (defaults).
 * @param {string} tenantId
 */
async function ensureWorkTimeSettings(tenantId) {
  let row = await prisma.workTimeSettings.findUnique({ where: { tenantId } });
  if (!row) {
    row = await prisma.workTimeSettings.create({
      data: { tenantId, ...DEFAULT_SETTINGS },
    });
  }
  return row;
}

/**
 * @param {import('express').Request} req
 * @param {string} [queryTenantId]
 * @returns {string|null}
 */
function resolveAdminTargetTenantId(req, queryTenantId) {
  const a = req.admin;
  if (!a) return null;
  const q = String(queryTenantId || '').trim();
  if (a.panelUser) {
    if (a.role === 'SAAS_ADMIN') return q || null;
    return a.tenantId || null;
  }
  return q || null;
}

/**
 * Efetivo para o app móvel: flag + módulo tenant + utilizador.
 * @param {string} userId
 */
async function getWorkTimeEffectiveForUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      role: true,
      workTimeTrackingEnabled: true,
      workTimeEnrolledAt: true,
      faceEnrollmentPhotos: true,
      comprefaceRecognitionSync: true,
    },
  });
  if (!user) {
    return {
      ok: false,
      error: 'Utilizador não encontrado.',
    };
  }
  const flagOn = await isWorkTimeFeatureFlagEnabled(user.tenantId);
  const settings = await ensureWorkTimeSettings(user.tenantId);
  const enrolled = faceEnrollmentOk(user);
  const moduleOn = !!settings.moduleEnabled;
  const userOn = !!user.workTimeTrackingEnabled;
  const effective = flagOn && moduleOn && userOn && canAccountAccessWorkTime(user.role);

  const canPunch = effective;

  return {
    ok: true,
    tenantId: user.tenantId,
    userId: user.id,
    role: user.role,
    featureFlagEnabled: flagOn,
    settings: {
      moduleEnabled: settings.moduleEnabled,
      requireFaceOnEveryPunch: settings.requireFaceOnEveryPunch,
      requireGpsOnEveryPunch: settings.requireGpsOnEveryPunch,
      requireResolvedAddress: settings.requireResolvedAddress,
      maxClockDriftSeconds: settings.maxClockDriftSeconds,
      minGpsAccuracyMeters: settings.minGpsAccuracyMeters,
      employeeNoticeMarkdown: settings.employeeNoticeMarkdown,
      consentVersion: settings.consentVersion,
    },
    userWorkTimeEnabled: userOn,
    workTimeEnrolledAt: user.workTimeEnrolledAt,
    faceEnrollmentOk: enrolled,
    showWorkTimeInApp: effective,
    canRegisterPunch: canPunch,
  };
}

module.exports = {
  WORK_TIME_FLAG_KEY,
  canAccountAccessWorkTime,
  normalizeFacePhotos,
  faceEnrollmentOk,
  isWorkTimeFeatureFlagEnabled,
  ensureWorkTimeSettings,
  resolveAdminTargetTenantId,
  getWorkTimeEffectiveForUser,
  DEFAULT_SETTINGS,
};
