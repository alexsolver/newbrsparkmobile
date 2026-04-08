/**
 * Métricas de deslocamento/produtividade para pré-visualização PDF no browser
 * (espelha executionBusinessMetrics.js / operations.html).
 */

/** Trilha GPS no JSON: [[lat,lng],…] ou [{lat,lng},…]; por vezes string JSON (API/Android). */
export function normalizeTraversedPathForReport(raw) {
  if (raw == null) return null;
  let arr = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const c of arr) {
    if (Array.isArray(c) && c.length >= 2) {
      const la = Number(c[0]);
      const ln = Number(c[1]);
      if (Number.isFinite(la) && Number.isFinite(ln)) out.push([la, ln]);
    } else if (c && typeof c === 'object') {
      const la = Number(c.lat ?? c.latitude);
      const ln = Number(c.lng ?? c.lon ?? c.longitude);
      if (Number.isFinite(la) && Number.isFinite(ln)) out.push([la, ln]);
    }
  }
  return out.length ? out : null;
}

export function extractTransitEndpointsForReport(responses) {
  let startGPS = null;
  let endGPS = null;
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) {
    return { startGPS, endGPS };
  }
  for (const val of Object.values(responses)) {
    if (val == null) continue;
    const vStr = typeof val === 'string' ? val : JSON.stringify(val);
    try {
      const j = typeof val === 'object' ? val : JSON.parse(val);
      const act = String(j.action || '').toUpperCase();
      if (act === 'SAIDA') {
        const lat = j.coordinates?.lat ?? j.lat;
        const lng = j.coordinates?.lng ?? j.lng;
        if (lat !== undefined && lat !== null && String(lat).trim() !== '') {
          startGPS = {
            lat,
            lng,
            addr: j.address || '',
            time: j.timestamp,
            plannedMetrics: j.plannedMetrics && typeof j.plannedMetrics === 'object' ? j.plannedMetrics : null,
          };
        }
      } else if (act === 'CHEGADA') {
        const pathNorm = normalizeTraversedPathForReport(j.traversedPath);
        const lat = j.coordinates?.lat ?? j.lat;
        const lng = j.coordinates?.lng ?? j.lng;
        const hasCoord =
          lat != null &&
          String(lat).trim() !== '' &&
          Number.isFinite(Number(lat));
        const hasPath = pathNorm != null && pathNorm.length > 0;
        const hasPatrol = j.patrolCompliance && typeof j.patrolCompliance === 'object';
        if (hasCoord || hasPath || hasPatrol) {
          endGPS = {
            ...(hasCoord ? { lat: Number(lat), lng: lng != null && Number.isFinite(Number(lng)) ? Number(lng) : undefined } : {}),
            addr: j.address || '',
            time: j.timestamp,
            traversedPath: pathNorm != null ? pathNorm : undefined,
            actualMetrics: j.actualMetrics && typeof j.actualMetrics === 'object' ? j.actualMetrics : null,
            patrolCompliance:
              j.patrolCompliance && typeof j.patrolCompliance === 'object' ? j.patrolCompliance : null,
          };
        }
      }
    } catch {
      /* ignore campo inválido */
    }
  }
  return { startGPS, endGPS };
}

export function computeTransitSecondsFromEndpoints(startGPS, endGPS) {
  if (!startGPS || !endGPS || !startGPS.time || !endGPS.time) return null;
  const dt = Math.floor((new Date(endGPS.time).getTime() - new Date(startGPS.time).getTime()) / 1000);
  if (!Number.isFinite(dt) || dt <= 0) return 1;
  return dt;
}

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

function polylineLengthMeters(points) {
  const norm = normalizeTraversedPathForReport(points);
  if (!norm || norm.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < norm.length; i++) {
    const a = norm[i - 1];
    const b = norm[i];
    const d = haversineMeters(Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1]));
    if (d != null && Number.isFinite(d)) sum += d;
  }
  return sum > 0 ? sum : null;
}

export function buildTransitDisplayMetrics(startGPS, endGPS, task) {
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
  if (actualDistanceM == null && endGPS && normalizeTraversedPathForReport(endGPS.traversedPath)?.length >= 2) {
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

export function fmtDurationPtBr(sec) {
  if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) return '—';
  const n = Math.floor(Number(sec));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

/** Uma linha tipo “OS 1h 20m · Desloc. 35m” */
export function fmtDurationPtBrCompact(sec) {
  if (sec == null || !Number.isFinite(Number(sec)) || Number(sec) < 0) return '—';
  const n = Math.floor(Number(sec));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.max(0, n)}s`;
}

export function resolveProductivityFromTask(t) {
  const bm = t && t.businessMetrics;
  if (bm && bm.productivity && typeof bm.productivity === 'object') {
    const p = bm.productivity;
    return {
      osWallSec: p.osWallSec != null ? Number(p.osWallSec) : null,
      transitSec: p.transitSec != null ? Number(p.transitSec) : null,
      exTransitSec: p.exTransitSec != null ? Number(p.exTransitSec) : null,
      formFillSec: p.formFillSec != null ? Number(p.formFillSec) : null,
      formActiveSec: p.formActiveSec != null ? Number(p.formActiveSec) : null,
    };
  }
  const responses = (t && t.responses) || {};
  const meta = (t && t.metadata) || {};
  const { startGPS, endGPS } = extractTransitEndpointsForReport(responses);
  const transitSec = computeTransitSecondsFromEndpoints(startGPS, endGPS);
  const osWallSec =
    t && t.startedAt && t.completedAt
      ? Math.max(
          0,
          Math.floor((new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime()) / 1000),
        )
      : null;
  const exTransitSec =
    osWallSec != null && transitSec != null ? Math.max(0, osWallSec - transitSec) : null;
  const fillSec = Number(meta.formFillDurationSeconds ?? meta.durationSeconds ?? responses.__form_fill_duration_sec);
  const activeSec = Number(meta.formActiveSeconds ?? responses.__form_active_seconds_final);
  return {
    osWallSec: Number.isFinite(osWallSec) ? osWallSec : null,
    transitSec,
    exTransitSec,
    formFillSec: Number.isFinite(fillSec) && fillSec >= 0 ? Math.floor(fillSec) : null,
    formActiveSec: Number.isFinite(activeSec) && activeSec >= 0 ? Math.floor(activeSec) : null,
  };
}

export function transitPctDeltaVsPlanned(planned, actual) {
  const p = Number(planned);
  const a = Number(actual);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (!Number.isFinite(a)) return null;
  return ((a - p) / p) * 100;
}
