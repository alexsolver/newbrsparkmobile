'use strict';

const prisma = require('../db');
const { resolveScopedTenantId } = require('./authorization');
const { resolveAppEffectiveTenantId } = require('./appLoginEffectiveTenant');

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
 * Matrícula facial «ok» para o ponto: exige fotos base no perfil.
 * `comprefaceRecognitionSync`: `synced` ou `pending` contam como OK; só `error` falha.
 *
 * @param {import('@prisma/client').User} user
 */
function faceEnrollmentOk(user) {
  const photos = normalizeFacePhotos(user.faceEnrollmentPhotos);
  if (photos.length === 0) return false;
  const s = user.comprefaceRecognitionSync;
  if (!s || typeof s !== 'object') return true;
  const st = String(s.status || '').toLowerCase();
  if (st === 'error') return false;
  return st === 'synced' || st === 'pending';
}

/**
 * Flag efetiva work_time (global + override tenant), alinhado a GET /api/flags.
 * @param {string} tenantId
 * @param {import('@prisma/client').PrismaClient} [db]
 */
async function isWorkTimeFeatureFlagEnabled(tenantId, db = prisma) {
  const global = await db.featureFlag.findFirst({
    where: { key: WORK_TIME_FLAG_KEY, tenantId: null },
  });
  const gEnabled = global ? !!global.enabled : true;
  if (!tenantId) return gEnabled;
  const over = await db.featureFlag.findFirst({
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
 * @param {import('@prisma/client').PrismaClient} [db]
 */
async function ensureWorkTimeSettings(tenantId, db = prisma) {
  let row = await db.workTimeSettings.findUnique({ where: { tenantId } });
  if (!row) {
    row = await db.workTimeSettings.create({
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
  return resolveScopedTenantId(req.authorization, String(queryTenantId || '').trim() || null);
}

/**
 * Efetivo para o app móvel: flag + módulo tenant + usuário.
 * O escopo de políticas (flags, WorkTimeSettings, regime BR) segue a tenant **efetiva**
 * (afiliação DEDICATED + ACTIVE, ver `authUser` / `resolveAppEffectiveTenantId`), não a linha `User.tenantId` na BD.
 *
 * @param {string} userId
 * @param {import('@prisma/client').PrismaClient} [db] — override para testes
 */
async function getWorkTimeEffectiveForUser(userId, db = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      role: true,
      workTimeTrackingEnabled: true,
      workTimeEnrolledAt: true,
      workTimeBrazilRegime: true,
      faceEnrollmentPhotos: true,
      comprefaceRecognitionSync: true,
      tenant: { select: { locale: { select: { countryCode: true } } } },
      technicianProfile: {
        select: { faceReenrollmentUntil: true, faceReenrollmentNote: true },
      },
    },
  });
  if (!user) {
    return {
      ok: false,
      error: 'Utilizador não encontrado.',
    };
  }

  const resolvedEff = await resolveAppEffectiveTenantId(db, userId);
  const scopeTenantId = resolvedEff && String(resolvedEff).trim() ? String(resolvedEff).trim() : String(user.tenantId);
  const homeTenantId = String(user.tenantId).trim();
  /** Com afiliação DEDICATED+ACTIVE, o operador costuma configurar flag/módulo na org «casa»; a tenant efetiva é a empresa. OR com a casa evita batidas bloqueadas indevidamente. */
  const dedicatedContext = homeTenantId.length > 0 && scopeTenantId !== homeTenantId;

  const flagScope = await isWorkTimeFeatureFlagEnabled(scopeTenantId, db);
  const flagHome = dedicatedContext ? await isWorkTimeFeatureFlagEnabled(homeTenantId, db) : false;
  const flagOn = flagScope || flagHome;
  const settings = await ensureWorkTimeSettings(scopeTenantId, db);
  const settingsHome = dedicatedContext ? await ensureWorkTimeSettings(homeTenantId, db) : null;
  const enrolled = faceEnrollmentOk(user);
  const moduleOn =
    !!settings.moduleEnabled || !!(settingsHome && settingsHome.moduleEnabled);
  const userOn = !!user.workTimeTrackingEnabled;
  const eligibleRole = canAccountAccessWorkTime(user.role);
  /** Módulo disponível para este papel (tab / entrada no ecrã); batidas exigem `userOn`. */
  const moduleEligible = flagOn && moduleOn && eligibleRole;
  const effective = moduleEligible && userOn;

  const canPunch = effective;

  let localeCountry = user.tenant?.locale?.countryCode;
  if (String(scopeTenantId) !== String(user.tenantId)) {
    const effT = await db.tenant.findUnique({
      where: { id: scopeTenantId },
      select: { locale: { select: { countryCode: true } } },
    });
    localeCountry = effT?.locale?.countryCode ?? localeCountry;
  }
  const tenantIsBr =
    String(localeCountry || '')
      .trim()
      .toUpperCase() === 'BR';
  /** `null` fora do Brasil; no BR, default CLT quando ainda não gravado. */
  const workTimeBrazilRegime =
    tenantIsBr && userOn ? user.workTimeBrazilRegime || 'CLT' : null;

  const reUntil = user.technicianProfile?.faceReenrollmentUntil;
  const faceReenrollmentWindowOpen =
    !!reUntil && new Date(reUntil).getTime() > Date.now();

  return {
    ok: true,
    tenantId: scopeTenantId,
    userId: user.id,
    role: user.role,
    workTimeBrazilRegime,
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
    faceReenrollmentWindowOpen,
    faceReenrollmentUntil: reUntil ? new Date(reUntil).toISOString() : null,
    faceReenrollmentNote: user.technicianProfile?.faceReenrollmentNote || null,
    showWorkTimeInApp: moduleEligible,
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
