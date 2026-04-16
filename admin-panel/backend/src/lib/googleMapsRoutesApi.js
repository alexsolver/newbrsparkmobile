'use strict';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const MAX_STRAIGHT_M = 900_000;

function parseDurationSeconds(route) {
  if (!route || typeof route !== 'object') return null;
  const d = route.duration;
  if (typeof d === 'string') {
    const m = d.match(/^(\d+)s$/);
    if (m) return Number(m[1]);
  }
  if (d && typeof d === 'object') {
    const s = d.seconds;
    if (s != null && Number.isFinite(Number(s))) return Math.floor(Number(s));
  }
  return null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Um trecho a conduzir (Google Routes API v2).
 * @returns {Promise<{ ok: true, durationSeconds: number, distanceMeters: number } | { ok: false, message: string }>}
 */
async function computeDrivingRouteMetrics(apiKey, originLat, originLng, destLat, destLng, timeoutMs = 15000) {
  const key = String(apiKey || '').trim();
  if (!key) return { ok: false, message: 'API key não configurada.' };
  for (const [label, v] of [
    ['origem latitude', originLat],
    ['origem longitude', originLng],
    ['destino latitude', destLat],
    ['destino longitude', destLng],
  ]) {
    if (!Number.isFinite(v) || Math.abs(v) > (label.includes('latitude') ? 90 : 180)) {
      return { ok: false, message: `${label} inválida.` };
    }
  }
  const straight = haversineMeters(originLat, originLng, destLat, destLng);
  if (straight > MAX_STRAIGHT_M) {
    return { ok: false, message: 'Distância entre pontos acima do limite permitido.' };
  }

  const body = {
    origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
    destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
  };

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, message: `Resposta inválida (HTTP ${res.status}).` };
    }
    if (!res.ok) {
      const msg =
        (data && (data.error?.message || data.error?.status)) ||
        text.slice(0, 200) ||
        `HTTP ${res.status}`;
      return { ok: false, message: String(msg) };
    }
    const routes = data?.routes;
    if (!Array.isArray(routes) || !routes[0]) {
      return { ok: false, message: 'Nenhuma rota devolvida pelo Google Maps.' };
    }
    const route = routes[0];
    const durationSeconds = parseDurationSeconds(route);
    const distanceMeters =
      route.distanceMeters != null && Number.isFinite(Number(route.distanceMeters))
        ? Math.round(Number(route.distanceMeters))
        : null;
    if (durationSeconds == null || durationSeconds < 0) {
      return { ok: false, message: 'Duração da rota indisponível na resposta.' };
    }
    if (distanceMeters == null || distanceMeters < 0) {
      return { ok: false, message: 'Distância da rota indisponível na resposta.' };
    }
    return { ok: true, durationSeconds, distanceMeters };
  } catch (e) {
    const aborted = e && (e.name === 'AbortError' || String(e.message || '').includes('aborted'));
    return {
      ok: false,
      message: aborted ? 'Tempo esgotado ao contactar Google Maps.' : String(e.message || e || 'Erro de rede'),
    };
  } finally {
    clearTimeout(to);
  }
}

module.exports = { computeDrivingRouteMetrics, ROUTES_URL };
