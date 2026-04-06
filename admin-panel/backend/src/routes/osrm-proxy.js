'use strict';
/**
 * Proxy de geometria OSRM para o app móvel: o telemóvel chama a API (já acessível),
 * o backend chama o OSRM (VPN / rede interna / URL só servidor).
 */
const express = require('express');
const prisma = require('../db');
const { normalizeOsrmBaseUrl, DEFAULT_OSRM_BASE } = require('../lib/osrmBaseUrl');

const router = express.Router();

function decodePolyline(encoded, precision) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = precision === 6 ? 1e6 : 1e5;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
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

function lineStringToLatLngRing(coords) {
  const ring = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const a = Number(c[0]);
    const b = Number(c[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    ring.push([b, a]);
  }
  return ring.length >= 2 ? ring : null;
}

function geometryFromItem(item) {
  const g = item && item.geometry;
  if (typeof g === 'string' && g.length >= 2) {
    for (const p of [5, 6]) {
      try {
        const dec = decodePolyline(g, p);
        if (dec.length >= 2) return dec;
      } catch (_) {
        /* precisão errada */
      }
    }
  }
  if (g && typeof g === 'object') {
    if (g.type === 'LineString' && Array.isArray(g.coordinates)) return lineStringToLatLngRing(g.coordinates);
    if (Array.isArray(g.coordinates) && g.coordinates.length >= 2) return lineStringToLatLngRing(g.coordinates);
    if (g.type === 'Feature' && g.geometry) return geometryFromItem({ geometry: g.geometry });
  }
  return null;
}

function extractCoordsFromOsrmJson(data) {
  if (!data) return null;
  if (data.code != null && String(data.code).toLowerCase() !== 'ok') return null;
  const wrap = data.data && typeof data.data === 'object' && (data.data.routes || data.data.matchings) ? data.data : data;
  if (wrap.code != null && String(wrap.code).toLowerCase() !== 'ok') return null;

  for (const col of [wrap.routes, wrap.matchings]) {
    if (!Array.isArray(col)) continue;
    for (const item of col) {
      const ring = geometryFromItem(item);
      if (ring && ring.length >= 2) return ring;
    }
  }
  return null;
}

async function fetchOsrmJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      return null;
    }
    if (!r.ok) return null;
    return j;
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

/** Só Route (sem Match): percurso com vários waypoints — Match não serve para esta forma. */
async function multiWaypointRouteGeometry(base, coordPath, timeoutMs) {
  const routeQs = [
    'overview=simplified&geometries=polyline',
    'overview=simplified&geometries=polyline6',
    'overview=full&geometries=polyline',
    'overview=full&geometries=polyline6',
    'overview=simplified&geometries=geojson',
    'overview=full&geometries=geojson',
  ];
  for (const q of routeQs) {
    const j = await fetchOsrmJson(`${base}/route/v1/driving/${coordPath}?${q}`, timeoutMs);
    const coords = extractCoordsFromOsrmJson(j);
    if (coords) return coords;
  }
  return null;
}

async function drivingPolylineForPath(base, coordPath, timeoutMs) {
  const routeQs = [
    'overview=simplified&geometries=polyline',
    'overview=simplified&geometries=polyline6',
    'overview=full&geometries=polyline',
    'overview=full&geometries=polyline6',
    'overview=simplified&geometries=geojson',
  ];
  for (const q of routeQs) {
    const j = await fetchOsrmJson(`${base}/route/v1/driving/${coordPath}?${q}`, timeoutMs);
    const coords = extractCoordsFromOsrmJson(j);
    if (coords) return coords;
  }
  const t0 = Math.floor(Date.now() / 1000);
  const t1 = t0 + 120;
  const matchQs = [
    `timestamps=${t0};${t1}&radiuses=unlimited;unlimited&tidy=false&overview=simplified&geometries=polyline`,
    `timestamps=${t0};${t1}&radiuses=200;200&tidy=false&overview=full&geometries=polyline`,
  ];
  for (const q of matchQs) {
    const j = await fetchOsrmJson(`${base}/match/v1/driving/${coordPath}?${q}`, timeoutMs);
    const coords = extractCoordsFromOsrmJson(j);
    if (coords) return coords;
  }
  return null;
}

async function getDrivingPolyline(base, oLat, oLng, dLat, dLng, timeoutMs) {
  const p1 = `${oLng},${oLat};${dLng},${dLat}`;
  let coords = await drivingPolylineForPath(base, p1, timeoutMs);
  if (coords) return coords;
  const p2 = `${oLng},${oLat};${dLat},${dLng}`;
  return drivingPolylineForPath(base, p2, timeoutMs);
}

router.get('/route-polyline', async (req, res) => {
  const oLat = parseFloat(req.query.oLat);
  const oLng = parseFloat(req.query.oLng);
  const dLat = parseFloat(req.query.dLat);
  const dLng = parseFloat(req.query.dLng);
  if (![oLat, oLng, dLat, dLng].every((n) => Number.isFinite(n))) {
    return res.status(400).json({ error: 'Parâmetros oLat,oLng,dLat,dLng inválidos' });
  }
  if (Math.abs(oLat) > 90 || Math.abs(dLat) > 90 || Math.abs(oLng) > 180 || Math.abs(dLng) > 180) {
    return res.status(400).json({ error: 'Coordenadas fora dos limites' });
  }

  let osrmBase = DEFAULT_OSRM_BASE;
  try {
    const osrmRow = await prisma.integration.findFirst({
      where: { name: 'OSRM', status: 'ACTIVE' },
      select: { baseUrl: true },
    });
    if (osrmRow?.baseUrl) osrmBase = normalizeOsrmBaseUrl(osrmRow.baseUrl);
  } catch (_) {
    /* default */
  }

  const timeoutMs = Math.min(120000, Math.max(8000, Number(process.env.OSRM_PROXY_TIMEOUT_MS) || 60000));
  const coords = await getDrivingPolyline(osrmBase, oLat, oLng, dLat, dLng, timeoutMs);
  if (!coords || coords.length < 2) {
    return res.status(502).json({ error: 'OSRM não devolveu geometria utilizável' });
  }
  const maxPts = Math.min(8000, Math.max(500, Number(process.env.OSRM_PROXY_MAX_POINTS) || 4000));
  let out = coords;
  if (out.length > maxPts) {
    const step = Math.ceil(out.length / maxPts);
    const dec = [];
    for (let i = 0; i < out.length; i += step) dec.push(out[i]);
    const last = out[out.length - 1];
    const lo = dec[dec.length - 1];
    if (!lo || lo[0] !== last[0] || lo[1] !== last[1]) dec.push(last);
    out = dec;
  }

  res.json({ coordinates: out });
});

const MAX_WAYPOINTS_BODY = 100;

/** Mapa do prestador: vários pontos na ordem (origem + OS ordenadas). */
router.post('/route-geometry', async (req, res) => {
  const wps = req.body?.waypoints;
  if (!Array.isArray(wps) || wps.length < 2 || wps.length > MAX_WAYPOINTS_BODY) {
    return res.status(400).json({
      error: 'Envie JSON { waypoints: [{ lat, lng }, ...] } com 2 a 100 pontos',
    });
  }
  const pairs = [];
  for (const w of wps) {
    const lat = Number(w.lat);
    const lng = Number(w.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'Cada waypoint precisa de lat e lng numéricos' });
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Coordenada fora dos limites' });
    }
    pairs.push(`${lng},${lat}`);
  }
  const coordPath = pairs.join(';');

  let osrmBase = DEFAULT_OSRM_BASE;
  try {
    const osrmRow = await prisma.integration.findFirst({
      where: { name: 'OSRM', status: 'ACTIVE' },
      select: { baseUrl: true },
    });
    if (osrmRow?.baseUrl) osrmBase = normalizeOsrmBaseUrl(osrmRow.baseUrl);
  } catch (_) {
    /* default */
  }

  const timeoutMs = Math.min(180000, Math.max(10000, Number(process.env.OSRM_MULTI_TIMEOUT_MS) || 90000));
  const coords = await multiWaypointRouteGeometry(osrmBase, coordPath, timeoutMs);
  if (!coords || coords.length < 2) {
    return res.status(502).json({ error: 'OSRM não devolveu geometria para este percurso' });
  }
  const maxPts = Math.min(8000, Math.max(500, Number(process.env.OSRM_PROXY_MAX_POINTS) || 4000));
  let out = coords;
  if (out.length > maxPts) {
    const step = Math.ceil(out.length / maxPts);
    const dec = [];
    for (let i = 0; i < out.length; i += step) dec.push(out[i]);
    const last = out[out.length - 1];
    const lo = dec[dec.length - 1];
    if (!lo || lo[0] !== last[0] || lo[1] !== last[1]) dec.push(last);
    out = dec;
  }
  res.json({ coordinates: out });
});

module.exports = router;
