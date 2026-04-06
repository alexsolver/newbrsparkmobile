'use strict';

const { normalizeOsrmBaseUrl } = require('./osrmBaseUrl');

const MATCH_TIMEOUT_MS = Number(process.env.OSRM_MATCH_TIMEOUT_MS) || 8000;
const ROUTE_TIMEOUT_MS = Number(process.env.OSRM_ROUTE_TIMEOUT_MS) || 5000;
/** Raio de busca por ponto (m) — mesmo formato que o OSRM espera em `radiuses` */
const DEFAULT_MATCH_RADIUS = Math.min(200, Math.max(5, Number(process.env.OSRM_MATCH_RADIUS_M) || 50));
const MAX_TRACE_POINTS = Math.min(25, Math.max(2, Number(process.env.OSRM_MAX_TRACE_POINTS) || 18));

/**
 * @param {Date|number|null|undefined} t
 * @returns {number|null} ms epoch
 */
function timeMs(t) {
  if (t == null) return null;
  if (t instanceof Date) return t.getTime();
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Constrói ETA (minutos) via OSRM Match (trace + destino), com fallback Route ponto-a-ponto.
 * Match: /match/v1/driving/{coords}?timestamps=…&radiuses=…&tidy=true
 *
 * @param {string} osrmBase
 * @param {Array<{ lat: number, lng: number, at?: Date|number|null }>} traceChrono - mais antigo → mais recente
 * @param {number} destLat
 * @param {number} destLng
 * @returns {Promise<number|null>} minutos arredondados ou null
 */
async function osrmEtaMinutesMatchOrRoute(osrmBase, traceChrono, destLat, destLng) {
  const base = normalizeOsrmBaseUrl(osrmBase || '');
  const pts = traceChrono
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .slice(-MAX_TRACE_POINTS);
  if (pts.length === 0 || !Number.isFinite(destLat) || !Number.isFinite(destLng)) return null;

  const last = pts[pts.length - 1];
  const coordStr = [...pts.map((p) => `${p.lng},${p.lat}`), `${destLng},${destLat}`].join(';');

  const nowSec = Math.floor(Date.now() / 1000);
  const secPerStep = 30;
  let tsList = pts.map((p, i) => {
    const ms = timeMs(p.at);
    if (ms != null) return Math.floor(ms / 1000);
    return nowSec - (pts.length - 1 - i) * secPerStep;
  });
  for (let i = 1; i < tsList.length; i++) {
    if (tsList[i] < tsList[i - 1]) tsList[i] = tsList[i - 1];
  }
  const lastTraceSec = tsList[tsList.length - 1];
  tsList = [...tsList, lastTraceSec + Math.max(1, secPerStep)];
  const tsStr = tsList.join(';');
  const radiuses = tsList.map(() => DEFAULT_MATCH_RADIUS).join(';');
  // OSRM espera `;` como separador nos parâmetros (igual ao cliente Lansolver)
  const matchUrl = `${base}/match/v1/driving/${coordStr}?timestamps=${tsStr}&radiuses=${radiuses}&tidy=true`;

  try {
    const r = await fetch(matchUrl, { method: 'GET', signal: AbortSignal.timeout(MATCH_TIMEOUT_MS) });
    const data = r.ok ? await r.json().catch(() => null) : null;
    if (data && Array.isArray(data.matchings) && data.matchings[0] && typeof data.matchings[0].duration === 'number') {
      return Math.round(data.matchings[0].duration / 60);
    }
  } catch (_) {
    /* fallback abaixo */
  }

  try {
    const routeUrl = `${base}/route/v1/driving/${last.lng},${last.lat};${destLng},${destLat}?overview=false`;
    const r2 = await fetch(routeUrl, { method: 'GET', signal: AbortSignal.timeout(ROUTE_TIMEOUT_MS) });
    if (!r2.ok) return null;
    const data2 = await r2.json().catch(() => null);
    if (data2 && data2.routes && data2.routes[0] && typeof data2.routes[0].duration === 'number') {
      return Math.round(data2.routes[0].duration / 60);
    }
  } catch (_) {
    return null;
  }
  return null;
}

module.exports = { osrmEtaMinutesMatchOrRoute, DEFAULT_MATCH_RADIUS, MAX_TRACE_POINTS };
