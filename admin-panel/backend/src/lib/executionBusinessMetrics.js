'use strict';

/**
 * Snapshot alinhado ao PDF / painel (operations.html) para persistência, relatórios e regras.
 * `schemaVersion` incrementar quando o significado dos campos mudar.
 */

const SCHEMA_VERSION = 3;

const { parseTemplateSchemaArray, effectiveFormFieldType } = require('./revisionSessionFields');
const { resolveSectionBreakLabel } = require('./executionTaskPanel');

function haversineMeters(lat1, lng1, lat2, lng2) {
  const a1 = Number(lat1);
  const o1 = Number(lng1);
  const a2 = Number(lat2);
  const o2 = Number(lng2);
  if (![a1, o1, a2, o2].every((x) => Number.isFinite(x))) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const m = haversineMeters(lat1, lng1, lat2, lng2);
  return m != null && Number.isFinite(m) ? m / 1000 : null;
}

function polylineLengthMeters(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const d = haversineMeters(Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1]));
    if (d != null && Number.isFinite(d)) sum += d;
  }
  return sum > 0 ? sum : null;
}

function extractTransitEndpointsForReport(responses) {
  let startGPS = null;
  let endGPS = null;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return { startGPS, endGPS };
  }
  for (const val of Object.values(responses)) {
    if (val == null) continue;
    const vStr = typeof val === 'string' ? val : JSON.stringify(val);
    if (vStr.includes('"action":"SAIDA"')) {
      try {
        const j = typeof val === 'object' ? val : JSON.parse(val);
        const lat = j.coordinates?.lat ?? j.lat;
        const lng = j.coordinates?.lng ?? j.lng;
        if (lat !== undefined) {
          startGPS = {
            lat,
            lng,
            addr: j.address || '',
            time: j.timestamp,
            plannedMetrics: j.plannedMetrics && typeof j.plannedMetrics === 'object' ? j.plannedMetrics : null,
          };
        }
      } catch {
        /* ignore */
      }
    } else if (vStr.includes('"action":"CHEGADA"')) {
      try {
        const j = typeof val === 'object' ? val : JSON.parse(val);
        const lat = j.coordinates?.lat ?? j.lat;
        const lng = j.coordinates?.lng ?? j.lng;
        if (lat !== undefined) {
          endGPS = {
            lat,
            lng,
            addr: j.address || '',
            time: j.timestamp,
            traversedPath: j.traversedPath,
            actualMetrics: j.actualMetrics && typeof j.actualMetrics === 'object' ? j.actualMetrics : null,
          };
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { startGPS, endGPS };
}

function computeTransitSecondsFromEndpoints(startGPS, endGPS) {
  if (!startGPS || !endGPS || !startGPS.time || !endGPS.time) return null;
  const dt = Math.floor((new Date(endGPS.time).getTime() - new Date(startGPS.time).getTime()) / 1000);
  if (!Number.isFinite(dt) || dt <= 0) return 1;
  return dt;
}

function buildTransitDisplayMetrics(startGPS, endGPS, task) {
  const etaMin =
    task && task.etaMinutes != null && Number.isFinite(Number(task.etaMinutes))
      ? Number(task.etaMinutes)
      : null;
  const pm =
    startGPS && startGPS.plannedMetrics && typeof startGPS.plannedMetrics === 'object'
      ? startGPS.plannedMetrics
      : null;
  let plannedDurationSec =
    pm && pm.durationSeconds != null && Number.isFinite(Number(pm.durationSeconds))
      ? Math.floor(Number(pm.durationSeconds))
      : null;
  if (plannedDurationSec == null && etaMin != null && etaMin > 0) {
    plannedDurationSec = Math.round(etaMin * 60);
  }
  let plannedDistanceM =
    pm && pm.distanceMeters != null && Number.isFinite(Number(pm.distanceMeters))
      ? Math.round(Number(pm.distanceMeters))
      : null;
  let plannedSourceKey = '';
  if (pm && pm.source) plannedSourceKey = String(pm.source);
  else if (pm == null && etaMin != null && etaMin > 0) plannedSourceKey = 'task_eta_legacy';

  const am =
    endGPS && endGPS.actualMetrics && typeof endGPS.actualMetrics === 'object' ? endGPS.actualMetrics : null;
  let actualDurationSec =
    am && am.durationSeconds != null && Number.isFinite(Number(am.durationSeconds))
      ? Math.floor(Number(am.durationSeconds))
      : null;
  if (actualDurationSec == null) {
    actualDurationSec = computeTransitSecondsFromEndpoints(startGPS, endGPS);
  }
  let actualDistanceM =
    am && am.distanceMeters != null && Number.isFinite(Number(am.distanceMeters))
      ? Math.round(Number(am.distanceMeters))
      : null;
  let actualDistFromPolyline = false;
  if (actualDistanceM == null && endGPS && Array.isArray(endGPS.traversedPath) && endGPS.traversedPath.length >= 2) {
    const pl = polylineLengthMeters(endGPS.traversedPath);
    if (pl != null && pl > 0) {
      actualDistanceM = Math.round(pl);
      actualDistFromPolyline = true;
    }
  }
  if (
    actualDistanceM == null &&
    startGPS &&
    endGPS &&
    [startGPS.lat, startGPS.lng, endGPS.lat, endGPS.lng].every((x) => x != null && Number.isFinite(parseFloat(x)))
  ) {
    const hm = haversineMeters(
      parseFloat(startGPS.lat),
      parseFloat(startGPS.lng),
      parseFloat(endGPS.lat),
      parseFloat(endGPS.lng),
    );
    if (hm != null && hm > 0) actualDistanceM = Math.round(hm);
  }
  return {
    plannedDurationSec,
    plannedDistanceM,
    plannedSourceKey,
    actualDurationSec,
    actualDistanceM,
    actualDistFromPolyline,
  };
}

function pctDeltaVsPlanned(planned, actual) {
  const p = Number(planned);
  const a = Number(actual);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (!Number.isFinite(a)) return null;
  return Math.round(((a - p) / p) * 1000) / 10;
}

function wallSeconds(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  const sec = Math.max(
    0,
    Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );
  return Number.isFinite(sec) ? sec : null;
}

/** Igual ao painel: concluída = fim−início; em aberto = instante do snapshot − início. */
function resolveOsWallSecondsForSnapshot(startedAt, completedAt, snapshotAtMs) {
  if (!startedAt) return null;
  const t0 = new Date(startedAt).getTime();
  if (!Number.isFinite(t0)) return null;
  const snapRaw = snapshotAtMs != null ? Number(snapshotAtMs) : Date.now();
  const snap = Number.isFinite(snapRaw) ? snapRaw : Date.now();
  if (completedAt) {
    const t1 = new Date(completedAt).getTime();
    if (!Number.isFinite(t1)) return null;
    return Math.max(0, Math.floor((t1 - t0) / 1000));
  }
  return Math.max(0, Math.floor((snap - t0) / 1000));
}

/** Mínimo entre relógio do app e tempo da OS fora do deslocamento (SAÍDA→CHEGADA). */
function effectiveFormTimesForSnapshot(fillSec, activeSec, osWallSec, transitSec) {
  const fill = Number(fillSec);
  const act = Number(activeSec);
  const wall =
    osWallSec != null && Number.isFinite(Number(osWallSec)) && Number(osWallSec) > 0
      ? Math.floor(Number(osWallSec))
      : null;
  const tr =
    transitSec != null && Number.isFinite(Number(transitSec)) && Number(transitSec) >= 1
      ? Math.floor(Number(transitSec))
      : null;

  const safeFill = Number.isFinite(fill) && fill >= 0 ? fill : null;
  const safeAct = Number.isFinite(act) && act >= 0 ? act : null;

  if (wall == null || tr == null) {
    return {
      fill: safeFill != null ? Math.floor(safeFill) : null,
      active: safeAct != null ? Math.floor(safeAct) : null,
      excludesTransit: false,
    };
  }

  const outside = Math.max(0, wall - tr);
  return {
    fill: safeFill != null ? Math.floor(Math.min(safeFill, outside)) : null,
    active: safeAct != null ? Math.floor(Math.min(safeAct, outside)) : null,
    excludesTransit: true,
  };
}

function formatPlannedSourceShortPtBr(plannedSourceKey) {
  const k = String(plannedSourceKey || '').trim();
  if (k === 'google_routes') return 'Google Maps (rotas)';
  if (k === 'osrm') return 'OSRM';
  if (k === 'task_eta') return 'ETA da OS';
  if (k === 'straight_line') return 'Linha reta';
  if (k === 'task_eta_legacy') return 'ETA (legado)';
  return '';
}

function fmtDurationPtBr(sec) {
  if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) return '—';
  const n = Math.floor(Number(sec));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function sectionBreaksFromTemplate(template) {
  if (!template || template.schemaData == null) return [];
  const schemaArray = parseTemplateSchemaArray(template.schemaData);
  if (!Array.isArray(schemaArray)) return [];
  return schemaArray
    .filter((f) => f && f.id && effectiveFormFieldType(f) === 'section_break')
    .map((f) => {
      const human = resolveSectionBreakLabel(f);
      const rawLab = f.label != null ? String(f.label).trim() : '';
      return {
        id: f.id,
        label: human || rawLab || f.id,
      };
    });
}

/** Mesmo critério que `collectSectionTimingRowsForPreview` (pdfStandardBlocks.js). */
function collectSectionTimingRows(sectionBreaks, responses) {
  const rows = [];
  const seen = new Set();
  if (!responses || typeof responses !== 'object') return rows;

  const labelById = Object.create(null);
  if (Array.isArray(sectionBreaks)) {
    sectionBreaks.forEach((s) => {
      if (s && s.id && s.label != null && String(s.label).trim() !== '') {
        labelById[s.id] = String(s.label).trim();
      }
    });
  }

  const pushRow = (id, labelHint) => {
    if (!id || seen.has(id)) return;
    const startIso = responses[`__section_start_${id}`];
    const endIso = responses[`__section_end_${id}`];
    let sec = null;
    if (startIso && endIso) {
      const a = new Date(startIso).getTime();
      const b = new Date(endIso).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b)) sec = Math.max(0, Math.floor((b - a) / 1000));
    }
    const hint = labelHint != null && String(labelHint).trim() !== '' ? String(labelHint).trim() : '';
    let lab = '';
    if (hint && hint !== id) lab = hint;
    else if (labelById[id]) lab = labelById[id];
    else if (id === 'page_1') lab = 'Início (antes da 1ª etapa)';
    else lab = hint || id;
    rows.push({ sectionId: id, label: lab.trim() || id, durationSec: sec });
    seen.add(id);
  };

  if (Array.isArray(sectionBreaks)) {
    sectionBreaks.forEach((f) => {
      if (!f || !f.id) return;
      pushRow(f.id, f.label);
    });
  }

  Object.keys(responses).forEach((k) => {
    const m = k.match(/^__section_start_(.+)$/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    pushRow(id, labelById[id] || (id === 'page_1' ? 'Início (antes da 1ª etapa)' : id));
  });

  rows.sort((a, b) => {
    const p = (r) => (r.sectionId === 'page_1' ? 0 : 1);
    return p(a) - p(b);
  });

  return rows;
}

function parsePauseHistoryFromResponses(responses) {
  if (!responses || typeof responses !== 'object') return [];
  let h = responses.__pause_history;
  if (typeof h === 'string') {
    try {
      h = JSON.parse(h);
    } catch {
      h = [];
    }
  }
  return Array.isArray(h) ? h : [];
}

function sumPauseDurationSeconds(pauseHist) {
  let total = 0;
  if (!Array.isArray(pauseHist)) return 0;
  for (const ev of pauseHist) {
    if (!ev) continue;
    if (ev.endedAt == null || ev.endedAt === '') continue;
    if (ev.durationSec == null || !Number.isFinite(Number(ev.durationSec))) continue;
    total += Math.max(0, Number(ev.durationSec));
  }
  return total;
}

function buildReportSnapshot(opts) {
  const {
    responses,
    metadata,
    execution,
    transitSecEndpoints,
    tm,
    fillSec,
    activeSec,
    snapshotAtMs,
    template,
  } = opts;

  const startedAt = execution.startedAt;
  const completedAt = execution.completedAt;
  const osWallResolved = resolveOsWallSecondsForSnapshot(startedAt, completedAt, snapshotAtMs);
  const wallUsesCompletionOnly = !!(startedAt && completedAt);

  const outsideTransitSec =
    osWallResolved != null && transitSecEndpoints != null
      ? Math.max(0, osWallResolved - transitSecEndpoints)
      : null;

  const eff = effectiveFormTimesForSnapshot(fillSec, activeSec, osWallResolved, transitSecEndpoints);

  const plannedKm =
    tm.plannedDistanceM != null && Number.isFinite(Number(tm.plannedDistanceM))
      ? Math.round((Number(tm.plannedDistanceM) / 1000) * 100) / 100
      : null;
  const actualKm =
    tm.actualDistanceM != null && Number.isFinite(Number(tm.actualDistanceM))
      ? Math.round((Number(tm.actualDistanceM) / 1000) * 100) / 100
      : null;

  const sectionBreaks = sectionBreaksFromTemplate(template);
  const sectionTimings = collectSectionTimingRows(sectionBreaks, responses);
  const sectionTimingsSummaryLinePtBr = sectionTimings
    .map((r) => `${r.label}: ${fmtDurationPtBr(r.durationSec)}`)
    .join(' · ');

  const pauseHist = parsePauseHistoryFromResponses(responses);
  const pauseOpenCount = pauseHist.filter((ev) => ev && (ev.endedAt == null || ev.endedAt === '')).length;

  const footnoteProductivityPtBr = eff.excludesTransit
    ? 'Formulário e app em foco: mínimo entre o relógio do app e o tempo da OS fora do deslocamento (saída→chegada).'
    : null;

  return {
    schemaVersion: 1,
    snapshotAtIso: new Date(Number.isFinite(Number(snapshotAtMs)) ? Number(snapshotAtMs) : Date.now()).toISOString(),
    wallClock: {
      osWallSec: osWallResolved,
      usesCompletedAtOnly: wallUsesCompletionOnly,
    },
    displacement: {
      transitSecFromEndpoints: transitSecEndpoints,
      outsideTransitSecEstimate: outsideTransitSec,
      plannedDurationSec: tm.plannedDurationSec ?? null,
      plannedDistanceKm: plannedKm,
      plannedSourceKey: tm.plannedSourceKey || null,
      plannedSourceLabelPtBr: formatPlannedSourceShortPtBr(tm.plannedSourceKey),
      actualDurationSec: tm.actualDurationSec ?? null,
      actualDistanceKm: actualKm,
      actualDistFromPolyline: !!tm.actualDistFromPolyline,
      pctDurationVsPlanned: pctDeltaVsPlanned(tm.plannedDurationSec, tm.actualDurationSec),
      pctDistanceVsPlanned: pctDeltaVsPlanned(tm.plannedDistanceM, tm.actualDistanceM),
    },
    formTimes: {
      fillSecAppClock: Number.isFinite(fillSec) && fillSec >= 0 ? Math.floor(fillSec) : null,
      activeSecAppClock: Number.isFinite(activeSec) && activeSec >= 0 ? Math.floor(activeSec) : null,
      fillSecExcludingTransit: eff.fill,
      activeSecExcludingTransit: eff.active,
      excludesTransitCapApplied: eff.excludesTransit,
      footnotePtBr: footnoteProductivityPtBr,
    },
    sectionTimings,
    sectionTimingsSummaryLinePtBr: sectionTimingsSummaryLinePtBr || null,
    pauses: {
      history: pauseHist.length ? pauseHist : [],
      eventCount: pauseHist.length,
      totalDurationClosedEventsSec: sumPauseDurationSeconds(pauseHist),
      openEndedEventCount: pauseOpenCount,
      formPausedSinceIso:
        responses && responses.__form_paused_since != null && String(responses.__form_paused_since).trim() !== ''
          ? String(responses.__form_paused_since)
          : null,
      lastPauseReasonSummary:
        metadata && metadata.lastPauseReasonSummary != null
          ? String(metadata.lastPauseReasonSummary)
          : null,
    },
  };
}

/**
 * @param {object} opts
 * @param {object} [opts.responses]
 * @param {object} [opts.metadata]
 * @param {object} opts.execution — etaMinutes, locationLat, locationLng, startedAt, completedAt, expectedFormDurationMinutes
 * @param {number|null} [opts.revision] — índice da submissão (1, 2, …)
 * @param {number|null} [opts.snapshotAtMs] — instante usado para «OS até agora» quando não há `completedAt` (default: Date.now())
 * @param {object|null} [opts.template] — modelo Prisma ChecklistTemplate (para tempos por etapa)
 * @returns {object}
 */
function computeExecutionBusinessMetrics(opts) {
  const responses =
    opts.responses && typeof opts.responses === 'object' && !Array.isArray(opts.responses) ? opts.responses : {};
  const metadata =
    opts.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata) ? opts.metadata : {};
  const ex = opts.execution || {};

  const snapshotAtMs = opts.snapshotAtMs != null ? Number(opts.snapshotAtMs) : Date.now();

  const { startGPS, endGPS } = extractTransitEndpointsForReport(responses);
  const tm = buildTransitDisplayMetrics(startGPS, endGPS, {
    etaMinutes: ex.etaMinutes,
    locationLat: ex.locationLat,
    locationLng: ex.locationLng,
  });

  const destLat = parseFloat(ex.locationLat);
  const destLng = parseFloat(ex.locationLng);
  const hasDestCoords = Number.isFinite(destLat) && Number.isFinite(destLng);
  let reachedDestination = null;
  let distToDestinationKm = null;
  if (hasDestCoords && endGPS && endGPS.lat != null && endGPS.lng != null) {
    distToDestinationKm = haversineKm(
      parseFloat(endGPS.lat),
      parseFloat(endGPS.lng),
      destLat,
      destLng,
    );
    reachedDestination = distToDestinationKm != null && distToDestinationKm <= 0.5;
  }

  let transitSeconds = tm.actualDurationSec;
  if (transitSeconds == null || !Number.isFinite(transitSeconds) || transitSeconds <= 0) {
    transitSeconds = 1;
  }
  const actualKm =
    tm.actualDistanceM != null && tm.actualDistanceM > 0 ? tm.actualDistanceM / 1000 : null;
  const avgSpeedKmh =
    actualKm != null && transitSeconds > 0 ? actualKm / (transitSeconds / 3600) : null;

  const transitSecEndpoints = computeTransitSecondsFromEndpoints(startGPS, endGPS);
  const osWallSec = wallSeconds(ex.startedAt, ex.completedAt);
  const exTransitSec =
    osWallSec != null && transitSecEndpoints != null ? Math.max(0, osWallSec - transitSecEndpoints) : null;

  const fillSec = Number(
    metadata.formFillDurationSeconds ?? metadata.durationSeconds ?? responses.__form_fill_duration_sec,
  );
  const activeSec = Number(metadata.formActiveSeconds ?? responses.__form_active_seconds_final);

  const plannedFormMinRaw = ex.expectedFormDurationMinutes;
  const plannedFormMin =
    plannedFormMinRaw != null && Number.isFinite(Number(plannedFormMinRaw)) && Number(plannedFormMinRaw) > 0
      ? Math.floor(Number(plannedFormMinRaw))
      : null;
  const plannedFormSec = plannedFormMin != null ? plannedFormMin * 60 : null;
  const fillSecFloor = Number.isFinite(fillSec) && fillSec >= 0 ? Math.floor(fillSec) : null;

  const reportSnapshot = buildReportSnapshot({
    responses,
    metadata,
    execution: ex,
    transitSecEndpoints,
    tm,
    fillSec,
    activeSec,
    snapshotAtMs,
    template: opts.template || null,
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    computedAt: new Date().toISOString(),
    revision: opts.revision != null && Number.isFinite(Number(opts.revision)) ? Number(opts.revision) : null,
    transit: {
      hasStart: !!startGPS,
      hasEnd: !!endGPS,
      plannedDurationSec: tm.plannedDurationSec,
      plannedDistanceM: tm.plannedDistanceM,
      plannedSourceKey: tm.plannedSourceKey || null,
      plannedSourceLabelPtBr: formatPlannedSourceShortPtBr(tm.plannedSourceKey),
      actualDurationSec: tm.actualDurationSec,
      actualDistanceM: tm.actualDistanceM,
      actualDistFromPolyline: tm.actualDistFromPolyline,
      pctDurationVsPlanned: pctDeltaVsPlanned(tm.plannedDurationSec, tm.actualDurationSec),
      pctDistanceVsPlanned: pctDeltaVsPlanned(tm.plannedDistanceM, tm.actualDistanceM),
      avgSpeedKmh:
        avgSpeedKmh != null && Number.isFinite(avgSpeedKmh) ? Math.round(avgSpeedKmh * 10) / 10 : null,
      reachedDestination,
      distToDestinationKm:
        distToDestinationKm != null && Number.isFinite(distToDestinationKm)
          ? Math.round(distToDestinationKm * 100) / 100
          : null,
      transitSecondsFromEndpoints: transitSecEndpoints,
    },
    productivity: {
      osWallSec,
      transitSec: transitSecEndpoints,
      exTransitSec,
      formFillSec: Number.isFinite(fillSec) && fillSec >= 0 ? Math.floor(fillSec) : null,
      formActiveSec: Number.isFinite(activeSec) && activeSec >= 0 ? Math.floor(activeSec) : null,
    },
    /** Formulário: previsto (despacho) vs tempo real de preenchimento (sem deslocamento). */
    formExecution: {
      plannedDurationMinutes: plannedFormMin,
      plannedDurationSec: plannedFormSec,
      actualFillSec: fillSecFloor,
      pctFillVsPlanned: pctDeltaVsPlanned(plannedFormSec, fillSecFloor),
    },
    /** Congelado por submissão — alinhado ao bloco «Produtividade» do relatório (PDF / central). */
    reportSnapshot,
  };
}

module.exports = {
  computeExecutionBusinessMetrics,
  SCHEMA_VERSION,
};
