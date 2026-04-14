'use strict';

const express = require('express');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { auditActor } = require('../lib/auditActor');
const {
  ensureWorkTimeSettings,
  resolveAdminTargetTenantId,
  getWorkTimeEffectiveForUser,
} = require('../lib/workTime');
const { reverseGeocodeLatLng } = require('../lib/workTimeGeocode');
const { enrichPunchRow } = require('../lib/workTimePunchEnrich');
const { attachAccumulatedWorkDayForReportRows, punchRecordStatusToneServer } = require('../lib/workTimeDayWorked');

const publicRouter = express.Router();
const adminRouter = express.Router();

const PUNCH_TYPES = new Set(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']);

const JUSTIFICATION_MIN = 10;
const JUSTIFICATION_MAX = 4000;

const REPORT_MAX_LIMIT = 200;
const EXPORT_MAX_ROWS = 10000;

function escapeCsvCell(val) {
  const s = val == null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function punchTypeLabelPt(type) {
  const m = {
    CLOCK_IN: 'Entrada',
    CLOCK_OUT: 'Saída',
    BREAK_START: 'Início intervalo',
    BREAK_END: 'Fim intervalo',
  };
  return m[type] || type;
}

function sanitizeDeviceInfo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const keys = [
    'brand',
    'modelName',
    'osName',
    'osVersion',
    'deviceName',
    'deviceYearClass',
    'appVersion',
    'nativeAppVersion',
    'platform',
  ];
  const out = {};
  for (const k of keys) {
    if (raw[k] == null) continue;
    const v = raw[k];
    if (typeof v === 'string') out[k] = v.trim().slice(0, 240);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

// ─── App (JWT usuário) ───────────────────────────────────────────────────

publicRouter.get('/me', authUser, async (req, res) => {
  try {
    const payload = await getWorkTimeEffectiveForUser(req.user.id);
    if (!payload.ok) return res.status(404).json({ error: payload.error });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/work-time/punches — regista uma batida (app móvel).
 * Corpo: type, deviceTimestamp (ISO), lat?, lng?, accuracy?, faceVerificationId?, faceScore?, faceEngine?,
 *        rawPayload? (ex.: appUserLogin = e-mail da sessão no app no momento da batida), exceptionRegistration?, exceptionJustification?, deviceInfo?,
 *        offlineDeferredSubmission?, offlineQueuedAt?, clientPunchUuid?
 */
publicRouter.post('/punches', authUser, express.json(), async (req, res) => {
  try {
    const eff = await getWorkTimeEffectiveForUser(req.user.id);
    if (!eff.ok) return res.status(404).json({ error: eff.error });
    if (!eff.canRegisterPunch) {
      return res.status(403).json({
        error: 'Registo de ponto não disponível (módulo ou permissões).',
        code: 'WORK_TIME_BLOCKED',
        ...eff,
      });
    }

    const {
      type,
      deviceTimestamp,
      lat,
      lng,
      accuracy,
      faceVerificationId,
      faceScore,
      faceEngine,
      rawPayload,
      exceptionRegistration: excIn,
      exceptionJustification: justIn,
      deviceInfo: deviceInfoIn,
      offlineDeferredSubmission: offlineDefIn,
      offlineQueuedAt: offlineQueuedAtIn,
      clientPunchUuid: clientPunchUuidIn,
    } = req.body || {};

    const exceptionRegistration = !!excIn;
    const exceptionJustification = String(justIn || '').trim();
    const offlineDeferredSubmission = !!offlineDefIn;
    const offlineQueuedAtInStr =
      offlineQueuedAtIn != null && String(offlineQueuedAtIn).trim()
        ? String(offlineQueuedAtIn).trim()
        : null;
    const clientPunchUuid =
      clientPunchUuidIn != null && String(clientPunchUuidIn).trim()
        ? String(clientPunchUuidIn).trim().slice(0, 128)
        : null;

    const t = String(type || '').toUpperCase();
    if (!PUNCH_TYPES.has(t)) {
      return res.status(400).json({ error: 'Tipo de batida inválido.' });
    }
    if (!deviceTimestamp) {
      return res.status(400).json({ error: 'deviceTimestamp (ISO) é obrigatório.' });
    }
    const devTs = new Date(deviceTimestamp);
    if (Number.isNaN(devTs.getTime())) {
      return res.status(400).json({ error: 'deviceTimestamp inválido.' });
    }

    if (offlineDeferredSubmission && !clientPunchUuid) {
      return res.status(400).json({
        error: 'Sincronização adiada requer clientPunchUuid (identificador da batida no aparelho).',
        code: 'OFFLINE_CLIENT_UUID_REQUIRED',
      });
    }

    const settings = eff.settings;
    const now = Date.now();
    if (!offlineDeferredSubmission) {
      const driftSec = Math.abs(Math.round((devTs.getTime() - now) / 1000));
      if (driftSec > (settings.maxClockDriftSeconds ?? 300)) {
        return res.status(400).json({
          error: `Relógio do dispositivo fora da tolerância (${settings.maxClockDriftSeconds}s).`,
          code: 'CLOCK_DRIFT',
        });
      }
    } else {
      const maxLateMs = 14 * 24 * 60 * 60 * 1000;
      if (now - devTs.getTime() > maxLateMs) {
        return res.status(400).json({
          error: 'Esta batida offline excede o prazo máximo para sincronização (14 dias).',
          code: 'OFFLINE_TOO_OLD',
        });
      }
      if (offlineQueuedAtInStr) {
        const qAt = new Date(offlineQueuedAtInStr);
        if (!Number.isNaN(qAt.getTime())) {
          const gap = Math.abs(Math.round((devTs.getTime() - qAt.getTime()) / 1000));
          if (gap > 900) {
            return res.status(400).json({
              error: 'Dados inconsistentes entre deviceTimestamp e offlineQueuedAt.',
              code: 'OFFLINE_QUEUE_TIMESTAMP_MISMATCH',
            });
          }
        }
      }
    }

    if (exceptionRegistration) {
      if (exceptionJustification.length < JUSTIFICATION_MIN) {
        return res.status(400).json({
          error: `Justificativa obrigatória para registro por exceção (mínimo ${JUSTIFICATION_MIN} caracteres).`,
          code: 'JUSTIFICATION_REQUIRED',
        });
      }
      if (exceptionJustification.length > JUSTIFICATION_MAX) {
        return res.status(400).json({ error: 'Justificativa demasiado longa.', code: 'JUSTIFICATION_TOO_LONG' });
      }
    }

    const userRow = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { tenantId: true },
    });
    if (!userRow) return res.status(404).json({ error: 'Utilizador não encontrado.' });

    if (clientPunchUuid) {
      const hits = await prisma.$queryRaw`
        SELECT id FROM "WorkTimePunch"
        WHERE "userId" = ${req.user.id}
          AND COALESCE("rawPayload"->>'clientPunchUuid','') = ${clientPunchUuid}
        LIMIT 1
      `;
      const hit0 = Array.isArray(hits) ? hits[0] : null;
      if (hit0 && hit0.id) {
        const existing = await prisma.workTimePunch.findUnique({ where: { id: hit0.id } });
        if (existing) return res.status(200).json(existing);
      }
    }

    const la0 = lat != null ? Number(lat) : NaN;
    const lo0 = lng != null ? Number(lng) : NaN;
    const la = Number.isFinite(la0) ? la0 : null;
    const lo = Number.isFinite(lo0) ? lo0 : null;
    const accNum = accuracy != null && Number.isFinite(Number(accuracy)) ? Number(accuracy) : null;

    let formattedAddress = null;
    let addressResolvedAt = null;
    if (la != null && lo != null) {
      formattedAddress = await reverseGeocodeLatLng(la, lo);
      addressResolvedAt = formattedAddress ? new Date() : null;
    }

    const faceId = faceVerificationId && String(faceVerificationId).trim() ? String(faceVerificationId).trim().slice(0, 200) : null;

    const gpsFinite = la != null && lo != null;
    let gpsAccuracyOk = true;
    if (
      settings.minGpsAccuracyMeters != null &&
      gpsFinite &&
      accNum != null &&
      Number.isFinite(accNum) &&
      accNum > settings.minGpsAccuracyMeters
    ) {
      gpsAccuracyOk = false;
    }

    const ideals = {
      gps:
        !settings.requireGpsOnEveryPunch ||
        (gpsFinite && gpsAccuracyOk),
      address: !settings.requireResolvedAddress || !!formattedAddress,
      face: !settings.requireFaceOnEveryPunch || !!faceId,
    };
    const idealPass = ideals.gps && ideals.address && ideals.face;

    if (exceptionRegistration) {
      if (idealPass) {
        return res.status(400).json({
          error: 'Registo por exceção só é permitido quando falha alguma validação obrigatória do tenant.',
          code: 'EXCEPTION_NOT_NEEDED',
        });
      }
    } else {
      if (settings.requireGpsOnEveryPunch) {
        if (!gpsFinite) {
          return res.status(400).json({
            error: 'Localização GPS obrigatória para esta batida.',
            code: 'GPS_REQUIRED',
            failures: ['GPS'],
          });
        }
        if (!gpsAccuracyOk) {
          return res.status(400).json({
            error: `Precisão GPS insuficiente (máx. ${settings.minGpsAccuracyMeters} m).`,
            code: 'GPS_ACCURACY',
            failures: ['GPS_ACCURACY'],
          });
        }
      }
      if (settings.requireResolvedAddress && !formattedAddress) {
        return res.status(400).json({
          error: 'Não foi possível resolver o endereço a partir das coordenadas. Tente novamente.',
          code: 'ADDRESS_REQUIRED',
          failures: ['ADDRESS'],
        });
      }
      if (settings.requireFaceOnEveryPunch) {
        if (!faceId) {
          return res.status(400).json({
            error: 'Verificação facial obrigatória para esta batida.',
            code: 'FACE_REQUIRED',
            failures: ['FACE'],
          });
        }
      }
    }

    const deviceSan = sanitizeDeviceInfo(deviceInfoIn);
    const validationSnapshot = {
      collectedAt: new Date().toISOString(),
      deviceInfo: deviceSan,
      gps: {
        ok: gpsFinite && gpsAccuracyOk,
        lat: la,
        lng: lo,
        accuracy: accNum,
        requiredByTenant: !!settings.requireGpsOnEveryPunch,
      },
      address: {
        ok: !!formattedAddress,
        formatted: formattedAddress,
        requiredByTenant: !!settings.requireResolvedAddress,
      },
      face: {
        ok: !!faceId,
        requiredByTenant: !!settings.requireFaceOnEveryPunch,
      },
      ideals,
      idealPass,
      exceptionRegistration,
      offlineDeferredSubmission,
      offlineQueuedAt: offlineQueuedAtInStr,
      clientPunchUuid,
      clockDriftIgnoredDueToOfflineDeferred: offlineDeferredSubmission,
    };

    const faceEnrollmentInvalid = !eff.faceEnrollmentOk;

    const mergedBase =
      rawPayload && typeof rawPayload === 'object'
        ? { ...rawPayload, deviceInfoClient: deviceSan }
        : deviceSan
          ? { deviceInfoClient: deviceSan }
          : undefined;
    const mergedRaw =
      clientPunchUuid != null
        ? { ...(mergedBase && typeof mergedBase === 'object' ? mergedBase : {}), clientPunchUuid }
        : mergedBase;

    const punch = await prisma.workTimePunch.create({
      data: {
        tenantId: userRow.tenantId,
        userId: req.user.id,
        type: t,
        deviceTimestamp: devTs,
        serverTimestamp: new Date(),
        lat: la,
        lng: lo,
        accuracy: accNum,
        formattedAddress,
        addressResolvedAt,
        faceVerificationId: faceId,
        faceScore: faceScore != null && Number.isFinite(Number(faceScore)) ? Number(faceScore) : null,
        faceEngine: faceEngine ? String(faceEngine).slice(0, 64) : null,
        faceEnrollmentInvalid,
        exceptionRegistration,
        exceptionJustification: exceptionRegistration ? exceptionJustification.slice(0, JUSTIFICATION_MAX) : null,
        validationSnapshot,
        rawPayload: mergedRaw,
        syncStatus: 'SYNCED',
      },
    });

    res.status(201).json(punch);
  } catch (err) {
    console.error('POST /work-time/punches', err);
    res.status(500).json({ error: err.message });
  }
});

/** Lista batidas do usuário autenticado (últimos N dias). */
publicRouter.get('/punches', authUser, async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '31'), 10) || 31));
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await prisma.workTimePunch.findMany({
      where: { userId: req.user.id, deviceTimestamp: { gte: since } },
      orderBy: { deviceTimestamp: 'desc' },
      take: 500,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeMatricula: true,
            personalDocuments: true,
            technicianProfile: { select: { cft: true } },
          },
        },
      },
    });
    const data = rows.map((r) => enrichPunchRow(r, { stripUser: true }));
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Painel admin ───────────────────────────────────────────────────────────

/**
 * Monta filtro comum para relatório de batidas (tenant obrigatório).
 * @param {string} tenantId
 * @param {{ userId?: string|null, from?: string|null, to?: string|null, days?: number }} q
 */
function buildPunchReportWhere(tenantId, q) {
  const where = { tenantId };
  const uid = String(q.userId || '').trim();
  if (uid) where.userId = uid;
  const fromStr = String(q.from || '').trim();
  const toStr = String(q.to || '').trim();
  if (fromStr || toStr) {
    where.deviceTimestamp = {};
    if (fromStr) {
      const d = new Date(fromStr);
      if (!Number.isNaN(d.getTime())) where.deviceTimestamp.gte = d;
    } else {
      where.deviceTimestamp.gte = new Date(0);
    }
    if (toStr) {
      const d = new Date(toStr);
      if (!Number.isNaN(d.getTime())) {
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        where.deviceTimestamp.lte = end;
      }
    } else {
      where.deviceTimestamp.lte = new Date();
    }
  } else {
    const days = Math.min(365, Math.max(1, Number(q.days) || 31));
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    where.deviceTimestamp = { gte: since };
  }
  return where;
}

adminRouter.get('/reports/punches', async (req, res) => {
  try {
    const tenantId = resolveAdminTargetTenantId(req, req.query.tenantId);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório (SAAS_ADMIN) ou sessão sem tenant.' });
    }

    const userIdFilter = String(req.query.userId || '').trim();
    if (userIdFilter) {
      const u = await prisma.user.findFirst({
        where: { id: userIdFilter, tenantId },
        select: { id: true },
      });
      if (!u) {
        return res.status(400).json({ error: 'Utilizador não encontrado neste tenant.' });
      }
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(REPORT_MAX_LIMIT, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '31'), 10) || 31));

    const where = buildPunchReportWhere(tenantId, {
      userId: userIdFilter || null,
      from: req.query.from,
      to: req.query.to,
      days,
    });

    const [total, rows] = await Promise.all([
      prisma.workTimePunch.count({ where }),
      prisma.workTimePunch.findMany({
        where,
        orderBy: { deviceTimestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          type: true,
          deviceTimestamp: true,
          serverTimestamp: true,
          lat: true,
          lng: true,
          accuracy: true,
          formattedAddress: true,
          validationSnapshot: true,
          rawPayload: true,
          faceEnrollmentInvalid: true,
          exceptionRegistration: true,
          exceptionJustification: true,
          faceVerificationId: true,
          faceScore: true,
          faceEngine: true,
          syncStatus: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeMatricula: true,
              role: true,
              personalDocuments: true,
              technicianProfile: { select: { cft: true } },
            },
          },
        },
      }),
    ]);

    await attachAccumulatedWorkDayForReportRows(rows, prisma, tenantId);
    const data = rows.map((r) => enrichPunchRow(r, { stripUser: true }));

    res.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('GET /work-time/reports/punches', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/reports/punches/export.csv', async (req, res) => {
  try {
    const tenantId = resolveAdminTargetTenantId(req, req.query.tenantId);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório (SAAS_ADMIN) ou sessão sem tenant.' });
    }

    const userIdFilter = String(req.query.userId || '').trim();
    if (userIdFilter) {
      const u = await prisma.user.findFirst({
        where: { id: userIdFilter, tenantId },
        select: { id: true },
      });
      if (!u) {
        return res.status(400).json({ error: 'Utilizador não encontrado neste tenant.' });
      }
    }

    const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '31'), 10) || 31));
    const where = buildPunchReportWhere(tenantId, {
      userId: userIdFilter || null,
      from: req.query.from,
      to: req.query.to,
      days,
    });

    const rows = await prisma.workTimePunch.findMany({
      where,
      orderBy: { deviceTimestamp: 'desc' },
      take: EXPORT_MAX_ROWS,
      select: {
        id: true,
        userId: true,
        type: true,
        deviceTimestamp: true,
        serverTimestamp: true,
        lat: true,
        lng: true,
        accuracy: true,
        formattedAddress: true,
        validationSnapshot: true,
        rawPayload: true,
        faceEnrollmentInvalid: true,
        exceptionRegistration: true,
        exceptionJustification: true,
        faceVerificationId: true,
        faceScore: true,
        faceEngine: true,
        syncStatus: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeMatricula: true,
            role: true,
            personalDocuments: true,
            technicianProfile: { select: { cft: true } },
          },
        },
      },
    });

    await attachAccumulatedWorkDayForReportRows(rows, prisma, tenantId);

    const header = [
      'id',
      'data_hora_dispositivo_iso',
      'data_hora_servidor_iso',
      'tipo',
      'tipo_label',
      'funcionario_nome_completo',
      'funcionario_matricula',
      'funcionario_email',
      'funcionario_papel',
      'aparelho_resumo',
      'gps_coletado_texto',
      'latitude',
      'longitude',
      'precisao_gps_m',
      'endereco_resolvido',
      'registo_excecao',
      'justificativa_excecao',
      'matricula_facial_invalida',
      'id_verificacao_rosto',
      'pontuacao_rosto',
      'motor_rosto',
      'estado_sincronizacao',
      'estado_registo',
      'jornada_acumulada_dia',
    ];

    const lines = [header.map(escapeCsvCell).join(',')];
    for (const r of rows) {
      const er = enrichPunchRow(r, { stripUser: true });
      lines.push(
        [
          er.id,
          er.deviceTimestamp ? new Date(er.deviceTimestamp).toISOString() : '',
          er.serverTimestamp ? new Date(er.serverTimestamp).toISOString() : '',
          er.type,
          punchTypeLabelPt(er.type),
          er.employeeFullName || '',
          er.employeeMatricula || '',
          er.employeeEmail || '',
          r.user?.role || '',
          er.deviceSummary || '',
          er.gpsLine || '',
          er.lat != null ? String(er.lat) : '',
          er.lng != null ? String(er.lng) : '',
          er.accuracy != null ? String(er.accuracy) : '',
          er.formattedAddress || '',
          er.exceptionRegistration ? 'sim' : 'nao',
          er.exceptionJustification || '',
          er.faceEnrollmentInvalid ? 'sim' : 'nao',
          er.faceVerificationId || '',
          er.faceScore != null ? String(er.faceScore) : '',
          er.faceEngine || '',
          er.syncStatus || '',
          punchRecordStatusToneServer(r) === 'success' ? 'conforme' : 'com_ressalva',
          er.accumulatedWorkDayLabel != null ? String(er.accumulatedWorkDayLabel) : '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    const csv = `\ufeff${lines.join('\n')}`;
    const safeTenant = String(tenantId).replace(/[^a-z0-9_-]/gi, '_').slice(0, 32);
    const fname = `batidas_ponto_${safeTenant}_${new Date().toISOString().slice(0, 10)}.csv`;

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId,
          action: 'WORK_TIME_PUNCHES_EXPORT_CSV',
          resource: tenantId,
          category: 'ADMIN',
          metadata: { rows: rows.length, userIdFilter: userIdFilter || null },
        },
      })
      .catch(() => {});

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(csv);
  } catch (err) {
    console.error('GET /work-time/reports/punches/export.csv', err);
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get('/settings', async (req, res) => {
  try {
    const tenantId = resolveAdminTargetTenantId(req, req.query.tenantId);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório (SAAS_ADMIN) ou sessão sem tenant.' });
    }
    const row = await ensureWorkTimeSettings(tenantId);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.patch('/settings', express.json(), async (req, res) => {
  try {
    const tenantId = resolveAdminTargetTenantId(req, req.body.tenantId || req.query.tenantId);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenantId é obrigatório.' });
    }
    await ensureWorkTimeSettings(tenantId);

    const allowed = [
      'moduleEnabled',
      'requireFaceOnEveryPunch',
      'requireGpsOnEveryPunch',
      'requireResolvedAddress',
      'maxClockDriftSeconds',
      'minGpsAccuracyMeters',
      'employeeNoticeMarkdown',
      'consentVersion',
    ];
    const data = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        const v = req.body[k];
        if (k === 'maxClockDriftSeconds') {
          const n = parseInt(String(v), 10);
          if (!Number.isFinite(n) || n < 30 || n > 86400) {
            return res.status(400).json({ error: 'maxClockDriftSeconds entre 30 e 86400.' });
          }
          data[k] = n;
        } else if (k === 'minGpsAccuracyMeters') {
          if (v === null || v === '') data[k] = null;
          else {
            const n = parseInt(String(v), 10);
            if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'minGpsAccuracyMeters inválido.' });
            data[k] = n;
          }
        } else if (k === 'employeeNoticeMarkdown' || k === 'consentVersion') {
          data[k] = v == null || v === '' ? null : String(v);
        } else if (typeof v === 'boolean') {
          data[k] = v;
        }
      }
    }

    const row = await prisma.workTimeSettings.update({
      where: { tenantId },
      data,
    });

    await prisma.auditLog
      .create({
        data: {
          ...auditActor(req),
          tenantId,
          action: 'WORK_TIME_SETTINGS_UPDATE',
          resource: tenantId,
          category: 'ADMIN',
          metadata: { keys: Object.keys(data) },
        },
      })
      .catch(() => {});

    res.json(row);
  } catch (err) {
    console.error('PATCH /work-time/settings', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { publicRouter, adminRouter };
