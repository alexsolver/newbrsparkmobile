/**
 * Chamadas OSRM no app — tolerante a respostas sem `code`, e fallback Table → N× Route
 * (muitos servidores self-hosted não expõem /table/v1).
 */
import { API_BASE } from './auth';
import { getOsrmBaseUrl, getOsrmRoutingBaseCandidates } from './osrmConfig';

const UA = 'BrsparkMobile/1.0';

/** Segundos na primeira rota (alguns proxies devolvem duration como string) */
export function routeDurationSeconds(j: any): number | null {
  const d = j?.routes?.[0]?.duration;
  if (d == null) return null;
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

export function isOsrmRouteOk(j: any): boolean {
  return routeDurationSeconds(j) != null;
}

/** Tabela de durações: matrix[source][dest] em segundos */
export function isOsrmTableOk(data: any): boolean {
  if (!data?.durations || !Array.isArray(data.durations) || !Array.isArray(data.durations[0])) return false;
  if (data.code != null && String(data.code).toLowerCase() !== 'ok') return false;
  return true;
}

async function fetchOsrmJson(url: string, timeoutMs: number): Promise<any> {
  const init: RequestInit = {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  };
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
    (init as any).signal = (AbortSignal as any).timeout(timeoutMs);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida do OSRM (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new Error((data && (data.message || data.code)) || `OSRM HTTP ${res.status}`);
  }
  return data;
}

export type OsrmDest = { id: string; locationLat: number; locationLng: number };

/**
 * Durações em segundos da origem até cada destino (índice alinhado a `tasks`).
 * 1) Tenta /table/v1; 2) Se falhar, N pedidos /route/v1 em lotes.
 */
export async function fetchTravelDurationsFromOrigin(
  base: string,
  oLat: number,
  oLng: number,
  tasks: OsrmDest[],
  options?: { tableTimeoutMs?: number; routeTimeoutMs?: number; routeConcurrency?: number }
): Promise<{ byId: Record<string, number>; via: 'table' | 'routes' }> {
  const tableTimeoutMs = options?.tableTimeoutMs ?? 28000;
  const routeTimeoutMs = options?.routeTimeoutMs ?? 16000;
  const concurrency = Math.min(8, Math.max(2, options?.routeConcurrency ?? 5));

  const coordPairs = [`${oLng},${oLat}`, ...tasks.map((p) => `${p.locationLng},${p.locationLat}`)];
  const tableUrl = `${base}/table/v1/driving/${coordPairs.join(';')}?sources=0`;

  try {
    const data = await fetchOsrmJson(tableUrl, tableTimeoutMs);
    if (isOsrmTableOk(data)) {
      const row = data.durations[0] as (number | null)[];
      const byId: Record<string, number> = {};
      tasks.forEach((p, index) => {
        const val = row[index + 1];
        byId[String(p.id)] = val != null && Number.isFinite(val) ? val : 999999;
      });
      return { byId, via: 'table' };
    }
  } catch {
    /* fallback routes */
  }

  const byId: Record<string, number> = {};
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency);
    await Promise.all(
      chunk.map(async (p) => {
        const id = String(p.id);
        try {
          const url = `${base}/route/v1/driving/${oLng},${oLat};${p.locationLng},${p.locationLat}?overview=false`;
          const j = await fetchOsrmJson(url, routeTimeoutMs);
          const sec = isOsrmRouteOk(j) ? routeDurationSeconds(j) : null;
          byId[id] = sec != null ? sec : 999999;
        } catch {
          try {
            const urlRev = `${base}/route/v1/driving/${oLng},${oLat};${p.locationLat},${p.locationLng}?overview=false`;
            const j2 = await fetchOsrmJson(urlRev, routeTimeoutMs);
            const sec2 = isOsrmRouteOk(j2) ? routeDurationSeconds(j2) : null;
            byId[id] = sec2 != null ? sec2 : 999999;
          } catch {
            byId[id] = 999999;
          }
        }
      })
    );
  }
  return { byId, via: 'routes' };
}

/** Trecho único origem → destino (ETA no deslocamento / mapa ao vivo). */
export async function fetchDrivingLegEtaMinutes(
  oLat: number,
  oLng: number,
  dLat: number,
  dLng: number,
  options?: { timeoutMs?: number }
): Promise<{ ok: boolean; minutes?: number }> {
  const timeoutMs = options?.timeoutMs ?? 22000;
  const base = await getOsrmBaseUrl();

  const one = async (qLat: number, qLng: number): Promise<{ ok: boolean; minutes?: number }> => {
    const url = `${base}/route/v1/driving/${oLng},${oLat};${qLng},${qLat}?overview=false`;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: ctrl.signal,
      });
      const text = await r.text();
      let j: any;
      try {
        j = JSON.parse(text);
      } catch {
        return { ok: false };
      }
      if (!r.ok) return { ok: false };
      const sec = routeDurationSeconds(j);
      if (sec == null) return { ok: false };
      return { ok: true, minutes: Math.max(1, Math.round(sec / 60)) };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(to);
    }
  };

  const first = await one(dLat, dLng);
  if (first.ok) return first;
  return one(dLng, dLat);
}

/** Polyline codificada (OSRM: `polyline` → 5 dec., `polyline6` → 6 dec.) → [[lat,lng], ...] */
function decodeOsrmPolyline(encoded: string, precision: 5 | 6): number[][] {
  const coordinates: number[][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = precision === 6 ? 1e6 : 1e5;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

function lineStringCoordsToLatLngRing(coords: unknown[]): number[][] | null {
  const out: number[][] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const a = Number(c[0]);
    const b = Number(c[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    out.push([b, a]);
  }
  return out.length >= 2 ? out : null;
}

/** GeoJSON LineString / MultiLineString / Feature (aninhado) → [[lat,lng], ...] */
function geometryObjectToRing(g: any): number[][] | null {
  if (!g || typeof g !== 'object') return null;
  if (g.type === 'Feature' && g.geometry) return geometryObjectToRing(g.geometry);
  if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
    const merged: unknown[] = [];
    for (const line of g.coordinates) {
      if (Array.isArray(line)) merged.push(...line);
    }
    return lineStringCoordsToLatLngRing(merged);
  }
  if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
    return lineStringCoordsToLatLngRing(g.coordinates);
  }
  if (Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    return lineStringCoordsToLatLngRing(g.coordinates);
  }
  return null;
}

/** Extrai `geometry` de um item route/matching OSRM. */
function geometryFromRouteLikeItem(item: any): number[][] | null {
  const g = item?.geometry;
  if (typeof g === 'string' && g.length >= 2) {
    for (const p of [5, 6] as const) {
      try {
        const dec = decodeOsrmPolyline(g, p);
        if (dec.length >= 2) return dec;
      } catch {
        /* precisão errada */
      }
    }
  }
  if (g && typeof g === 'object') {
    return geometryObjectToRing(g);
  }
  return null;
}

/** Quando `routes[0].geometry` vem vazio mas há `steps=true`, a geometria está por passo. */
function mergeLegStepGeometries(routeItem: any): number[][] | null {
  const legs = routeItem?.legs;
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const merged: number[][] = [];
  for (const leg of legs) {
    const steps = leg?.steps;
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      const ring = geometryFromRouteLikeItem(step);
      if (!ring || ring.length < 2) continue;
      if (merged.length === 0) {
        merged.push(...ring);
      } else {
        const last = merged[merged.length - 1];
        const first = ring[0];
        if (last[0] === first[0] && last[1] === first[1]) merged.push(...ring.slice(1));
        else merged.push(...ring);
      }
    }
  }
  return merged.length >= 2 ? merged : null;
}

/**
 * Resposta OSRM (Route ou Match) e proxies que embrulham em `data`.
 * Match: `matchings[].geometry` — Lansolver costuma testar Match; só Route falha às vezes.
 */
function extractGeometryFromOsrmResponse(j: any): number[][] | null {
  const root =
    j?.data && typeof j.data === 'object' && (j.data.routes || j.data.matchings) ? j.data : j;
  if (root?.code != null && String(root.code).toLowerCase() !== 'ok') return null;

  const collections = [root?.routes, root?.matchings];
  for (const col of collections) {
    if (!Array.isArray(col) || col.length === 0) continue;
    for (const item of col) {
      let ring = geometryFromRouteLikeItem(item);
      if (!ring || ring.length < 2) {
        ring = mergeLegStepGeometries(item);
      }
      if (ring && ring.length >= 2) return ring;
    }
  }
  return null;
}

const GEOMETRY_MAX_POINTS = 3500;

function capGeometryPoints(ring: number[][]): number[][] {
  if (ring.length <= GEOMETRY_MAX_POINTS) return ring;
  const step = Math.ceil(ring.length / GEOMETRY_MAX_POINTS);
  const out: number[][] = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  const last = ring[ring.length - 1];
  const lo = out[out.length - 1];
  if (!lo || lo[0] !== last[0] || lo[1] !== last[1]) out.push(last);
  return out;
}

/**
 * Geometria via backend Brspark: o telemóvel fala com a API (Wi‑Fi/LAN/produção);
 * o servidor fala com o OSRM (rede interna, VPN, URL inacessível no 5G).
 */
async function fetchDrivingGeometryViaBackend(
  oLat: number,
  oLng: number,
  dLat: number,
  dLng: number,
  timeoutMs: number
): Promise<number[][] | null> {
  const qs = new URLSearchParams({
    oLat: String(oLat),
    oLng: String(oLng),
    dLat: String(dLat),
    dLng: String(dLng),
  });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API_BASE}/api/osrm/route-polyline?${qs}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const text = await r.text();
    let j: any;
    try {
      j = JSON.parse(text);
    } catch {
      return null;
    }
    if (!r.ok) return null;
    const c = j?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return null;
    const out: number[][] = [];
    for (const p of c) {
      if (Array.isArray(p) && p.length >= 2) {
        const la = Number(p[0]);
        const ln = Number(p[1]);
        if (Number.isFinite(la) && Number.isFinite(ln)) out.push([la, ln]);
      }
    }
    return out.length >= 2 ? capGeometryPoints(out) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

/** [[lat, lng], ...] para `Polyline`. Rotas longas: `full`+geojson costuma falhar (payload enorme); polyline primeiro. */
export async function fetchDrivingGeometryLatLng(
  oLat: number,
  oLng: number,
  dLat: number,
  dLng: number,
  options?: { timeoutMs?: number }
): Promise<number[][] | null> {
  const polyTimeoutMs = options?.timeoutMs ?? 120000;
  const geojsonTimeoutMs = Math.max(polyTimeoutMs, 150000);

  // 1) Proxy no backend primeiro: o app fala com a API BrSpark; o servidor fala com o OSRM (LAN/VPN).
  // Se tentarmos antes o `osrmBaseUrl` da integração no telemóvel, costuma falhar (IP interno) e o mapa
  // fica só com a linha reta até esgotar dezenas de timeouts.
  const backendMs = Math.min(90000, Math.max(15000, polyTimeoutMs));
  const viaBackend = await fetchDrivingGeometryViaBackend(oLat, oLng, dLat, dLng, backendMs);
  if (viaBackend && viaBackend.length >= 2) return viaBackend;

  const tryUrl = async (url: string, timeoutMs: number): Promise<number[][] | null> => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: ctrl.signal,
      });
      const text = await r.text();
      let j: any;
      try {
        j = JSON.parse(text);
      } catch {
        return null;
      }
      if (!r.ok) return null;
      const line = extractGeometryFromOsrmResponse(j);
      return line && line.length >= 2 ? capGeometryPoints(line) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(to);
    }
  };

  const runForDestWithBase = async (
    base: string,
    qLat: number,
    qLng: number
  ): Promise<number[][] | null> => {
    const path = `${oLng},${oLat};${qLng},${qLat}`;
    const routeAttempts: { suffix: string; t: number }[] = [
      { suffix: 'overview=simplified&geometries=polyline&steps=true', t: polyTimeoutMs },
      { suffix: 'overview=simplified&geometries=polyline6&steps=true', t: polyTimeoutMs },
      { suffix: 'overview=simplified&geometries=polyline', t: polyTimeoutMs },
      { suffix: 'overview=simplified&geometries=polyline6', t: polyTimeoutMs },
      { suffix: 'overview=full&geometries=polyline', t: polyTimeoutMs },
      { suffix: 'overview=full&geometries=polyline6', t: polyTimeoutMs },
      { suffix: 'overview=simplified&geometries=geojson', t: polyTimeoutMs },
      { suffix: 'overview=full&geometries=geojson', t: geojsonTimeoutMs },
    ];
    for (const { suffix, t } of routeAttempts) {
      const line = await tryUrl(`${base}/route/v1/driving/${path}?${suffix}`, t);
      if (line) return line;
    }

    const t0 = Math.floor(Date.now() / 1000);
    const t1 = t0 + 120;
    const matchAttempts: { q: string; t: number }[] = [
      {
        q: `timestamps=${t0};${t1}&radiuses=unlimited;unlimited&tidy=false&overview=simplified&geometries=polyline`,
        t: polyTimeoutMs,
      },
      {
        q: `timestamps=${t0};${t1}&radiuses=unlimited;unlimited&tidy=false&overview=simplified&geometries=polyline6`,
        t: polyTimeoutMs,
      },
      {
        q: `timestamps=${t0};${t1}&radiuses=200;200&tidy=false&overview=full&geometries=polyline`,
        t: polyTimeoutMs,
      },
    ];
    for (const { q, t } of matchAttempts) {
      const line = await tryUrl(`${base}/match/v1/driving/${path}?${q}`, t);
      if (line) return line;
    }

    return null;
  };

  const bases = await getOsrmRoutingBaseCandidates();
  for (const base of bases) {
    const a = await runForDestWithBase(base, dLat, dLng);
    if (a) return a;
    const b = await runForDestWithBase(base, dLng, dLat);
    if (b) return b;
  }

  if (__DEV__) {
    console.warn('[osrm] geometry: nenhuma variante devolveu polilinha (rede, timeout ou formato do servidor).');
  }
  return null;
}

/**
 * Rota OSRM com vários waypoints num único GET (mesma base que as durações).
 * O proxy `/api/osrm` no telemóvel pode falhar (rede/IP); isto evita só linha reta quando o OSRM público/integração responde.
 * URLs muito longas: limitar a ~25 pontos por pedido (instâncias OSRM / proxies).
 */
/** Alinhado ao limite prático do POST `route-geometry` no app (evitar URL gigante no GET). */
const MULTI_WAYPOINT_MAX_POINTS = 28;

export async function fetchOsrmMultiWaypointLatLng(
  points: { lat: number; lng: number }[],
  options?: { timeoutMs?: number }
): Promise<number[][] | null> {
  if (!points || points.length < 2) return null;
  if (points.length > MULTI_WAYPOINT_MAX_POINTS) return null;

  const timeoutMs = options?.timeoutMs ?? 120000;
  const geojsonTimeoutMs = Math.max(timeoutMs, 150000);
  const path = points.map((p) => `${p.lng},${p.lat}`).join(';');

  const tryUrl = async (url: string, t: number): Promise<number[][] | null> => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), t);
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': UA },
        signal: ctrl.signal,
      });
      const text = await r.text();
      let j: any;
      try {
        j = JSON.parse(text);
      } catch {
        return null;
      }
      if (!r.ok) return null;
      const line = extractGeometryFromOsrmResponse(j);
      return line && line.length >= 2 ? capGeometryPoints(line) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(to);
    }
  };

  const routeAttempts: { suffix: string; t: number }[] = [
    { suffix: 'overview=simplified&geometries=polyline&steps=true', t: timeoutMs },
    { suffix: 'overview=simplified&geometries=polyline6&steps=true', t: timeoutMs },
    { suffix: 'overview=simplified&geometries=polyline', t: timeoutMs },
    { suffix: 'overview=simplified&geometries=polyline6', t: timeoutMs },
    { suffix: 'overview=full&geometries=polyline', t: timeoutMs },
    { suffix: 'overview=full&geometries=polyline6', t: timeoutMs },
    { suffix: 'overview=simplified&geometries=geojson', t: timeoutMs },
    { suffix: 'overview=full&geometries=geojson', t: geojsonTimeoutMs },
  ];

  const bases = await getOsrmRoutingBaseCandidates();
  for (const base of bases) {
    for (const { suffix, t } of routeAttempts) {
      const line = await tryUrl(`${base}/route/v1/driving/${path}?${suffix}`, t);
      if (line) return line;
    }
  }
  return null;
}

/**
 * Percurso com vários pontos em sequência (GPS → OS1 → OS2 …).
 * Cada trecho usa o mesmo proxy que o deslocamento; se um trecho falhar, usa reta só naquele trecho.
 */
export async function fetchStitchedDrivingRouteLatLng(
  points: { lat: number; lng: number }[],
  options?: { timeoutMs?: number }
): Promise<number[][] | null> {
  if (!points || points.length < 2) return null;
  const timeoutMs = options?.timeoutMs ?? 120000;
  const merged: number[][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (
      !Number.isFinite(a.lat) ||
      !Number.isFinite(a.lng) ||
      !Number.isFinite(b.lat) ||
      !Number.isFinite(b.lng)
    ) {
      continue;
    }
    const leg = await fetchDrivingGeometryLatLng(a.lat, a.lng, b.lat, b.lng, { timeoutMs });
    const useLeg =
      leg && leg.length >= 2
        ? leg
        : [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ];
    if (merged.length === 0) merged.push(...useLeg);
    else merged.push(...useLeg.slice(1));
  }
  return merged.length >= 2 ? merged : null;
}
