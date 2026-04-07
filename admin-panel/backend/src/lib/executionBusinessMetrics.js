'use strict';

/**
 * Snapshot alinhado ao PDF / painel (operations.html) para persistência, relatórios e regras.
 * `schemaVersion` incrementar quando o significado dos campos mudar.
 */

const SCHEMA_VERSION = 1;

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

/**
 * @param {object} opts
 * @param {object} [opts.responses]
 * @param {object} [opts.metadata]
 * @param {object} opts.execution — etaMinutes, locationLat, locationLng, startedAt, completedAt
 * @param {number|null} [opts.revision] — índice da submissão (1, 2, …)
 * @returns {object}
 */
function computeExecutionBusinessMetrics(opts) {
  const responses =
    opts.responses && typeof opts.responses === 'object' && !Array.isArray(opts.responses) ? opts.responses : {};
  const metadata =
    opts.metadata && typeof opts.metadata === 'object' && !Array.isArray(opts.metadata) ? opts.metadata : {};
  const ex = opts.execution || {};

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
  };
}

module.exports = {
  computeExecutionBusinessMetrics,
  SCHEMA_VERSION,
};
