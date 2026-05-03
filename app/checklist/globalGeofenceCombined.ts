/**
 * Cerca eletrônica global: destino da OS ∪ geometria (OR).
 * Partilhado entre GeofenceMapScreen, mapa consultivo e GeofenceStatusBar.
 */

import i18n from 'i18next';

export type GlobalGeofenceGeometry = {
  zoneType: string;
  locationLat?: number | null;
  locationLng?: number | null;
  locationRadius?: number | null;
  locationPolygon?: number[][] | string | null;
};

export type GlobalGeofenceMeta = {
  destination: { lat: number; lng: number } | null;
  destinationRadiusM: number;
  geometry: GlobalGeofenceGeometry | null;
};

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pointInPolygon(lat: number, lng: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (
      (poly[i][0] > lat) !== (poly[j][0] > lat) &&
      lng <
        ((poly[j][1] - poly[i][1]) * (lat - poly[i][0])) / (poly[j][0] - poly[i][0]) + poly[i][1]
    )
      inside = !inside;
  }
  return inside;
}

export function nearestRoutePoint(lat: number, lng: number, route: number[][]): number {
  let min = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const [aL, aG] = route[i];
    const [bL, bG] = route[i + 1];
    const dx = bG - aG;
    const dy = bL - aL;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((lng - aG) * dx + (lat - aL) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = haversine(lat, lng, aL + t * dy, aG + t * dx);
    if (d < min) min = d;
  }
  return min;
}

export function parsePolygonRaw(raw: unknown): number[][] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((pt: any) => {
      if (Array.isArray(pt)) return [parseFloat(pt[0]), parseFloat(pt[1])];
      return pt.lat !== undefined ? [parseFloat(pt.lat), parseFloat(pt.lng)] : pt;
    });
  } catch {
    return [];
  }
}

/**
 * Prioridade: navigationDestination (ponto) → locationLat/Lng.
 */
export function resolveGlobalFenceDestinationCoords(task: any): { lat: number; lng: number } | null {
  if (!task || typeof task !== 'object') return null;
  const nav = task.metadata?.navigationDestination;
  if (
    nav &&
    nav.kind === 'point' &&
    Number.isFinite(Number(nav.lat)) &&
    Number.isFinite(Number(nav.lng))
  ) {
    return { lat: Number(nav.lat), lng: Number(nav.lng) };
  }
  const lat = task.locationLat;
  const lng = task.locationLng;
  if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return { lat: Number(lat), lng: Number(lng) };
  }
  return null;
}

/** Há polilinha/polígono utilizável para a parte geometria da cerca global. */
export function taskHasGeometryForGlobalGate(task: any): boolean {
  if (!task || typeof task !== 'object') return false;
  if (task.locationPolygon == null) return false;
  try {
    const parsed =
      typeof task.locationPolygon === 'string' ? JSON.parse(task.locationPolygon) : task.locationPolygon;
    return Array.isArray(parsed) && parsed.length >= 2;
  } catch {
    return false;
  }
}

function evaluateGeometryInside(
  lat: number,
  lng: number,
  geom: GlobalGeofenceGeometry,
  fallbackRadiusM: number
): { inside: boolean; detail: string; dist: number | null } {
  const poly = parsePolygonRaw(geom.locationPolygon);
  const zt = String(geom.zoneType || '').toLowerCase();
  const rGeom =
    Number.isFinite(Number(geom.locationRadius)) && Number(geom.locationRadius) > 0
      ? Number(geom.locationRadius)
      : fallbackRadiusM;

  if (zt === 'polygon' && poly.length >= 3) {
    const inside = pointInPolygon(lat, lng, poly);
    return {
      inside,
      detail: inside
        ? i18n.t('appAlerts.globalFence.geomPolygonIn')
        : i18n.t('appAlerts.globalFence.geomPolygonOut'),
      dist: null,
    };
  }

  if (zt === 'route' && poly.length >= 2) {
    const d = Math.round(nearestRoutePoint(lat, lng, poly));
    const thr = rGeom;
    const inside = d <= thr;
    return {
      inside,
      detail: inside
        ? i18n.t('appAlerts.globalFence.geomRouteIn', { dist: d, thr })
        : i18n.t('appAlerts.globalFence.geomRouteOut', { dist: d, thr }),
      dist: d,
    };
  }

  if (zt === 'segment' && poly.length >= 2) {
    const distA = Math.round(haversine(lat, lng, poly[0][0], poly[0][1]));
    const distB = Math.round(haversine(lat, lng, poly[1][0], poly[1][1]));
    const dist = Math.min(distA, distB);
    const thr = rGeom > 0 ? rGeom : 150;
    const inside = dist <= thr;
    const endLabel =
      distA < distB ? i18n.t('appAlerts.globalFence.geomSegInEndA') : i18n.t('appAlerts.globalFence.geomSegInEndB');
    return {
      inside,
      detail: inside
        ? i18n.t('appAlerts.globalFence.geomSegIn', { dist, thr, end: endLabel })
        : i18n.t('appAlerts.globalFence.geomSegOut', { dist, thr }),
      dist,
    };
  }

  if (zt === 'radius') {
    const dLat = Number(geom.locationLat);
    const dLng = Number(geom.locationLng);
    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) {
      return { inside: false, detail: i18n.t('appAlerts.globalFence.geomRadiusNoCoords'), dist: null };
    }
    const d = Math.round(haversine(lat, lng, dLat, dLng));
    const inside = d <= rGeom;
    return {
      inside,
      detail: inside
        ? i18n.t('appAlerts.globalFence.geomRadiusIn', { dist: d, r: rGeom })
        : i18n.t('appAlerts.globalFence.geomRadiusOut', { dist: d }),
      dist: d,
    };
  }

  return { inside: false, detail: i18n.t('appAlerts.globalFence.geomUnknown'), dist: null };
}

export function evaluateCombinedGlobalFence(
  lat: number,
  lng: number,
  gf: GlobalGeofenceMeta
): {
  inside: boolean;
  insideDest: boolean;
  insideGeom: boolean;
  statusMsg: string;
  distanceDest: number | null;
  distanceGeom: number | null;
} {
  const dest = gf.destination;
  const rDest = gf.destinationRadiusM;
  let insideDest = false;
  let distanceDest: number | null = null;
  if (dest && Number.isFinite(rDest) && rDest > 0) {
    distanceDest = Math.round(haversine(lat, lng, dest.lat, dest.lng));
    insideDest = distanceDest <= rDest;
  }

  let insideGeom = false;
  let distanceGeom: number | null = null;
  let geomDetail = '';
  if (gf.geometry) {
    const g = evaluateGeometryInside(lat, lng, gf.geometry, gf.destinationRadiusM);
    insideGeom = g.inside;
    geomDetail = g.detail;
    distanceGeom = g.dist;
  }

  const inside = insideDest || insideGeom;

  let statusMsg = '';
  if (inside) {
    const parts: string[] = [];
    if (insideDest && distanceDest != null)
      parts.push(i18n.t('appAlerts.globalFence.insidePartDest', { dist: distanceDest, radius: rDest }));
    if (insideGeom) parts.push(i18n.t('appAlerts.globalFence.insidePartGeom', { detail: geomDetail }));
    statusMsg = i18n.t('appAlerts.globalFence.statusInside', { summary: parts.join(' · ') });
  } else {
    const parts: string[] = [];
    if (dest && distanceDest != null)
      parts.push(i18n.t('appAlerts.globalFence.outsidePartDest', { dist: distanceDest, radius: rDest }));
    if (gf.geometry) parts.push(i18n.t('appAlerts.globalFence.outsidePartGeom', { detail: geomDetail }));
    statusMsg =
      parts.length > 0
        ? i18n.t('appAlerts.globalFence.statusOutsideDetails', { details: parts.join(' | ') })
        : i18n.t('appAlerts.globalFence.statusOutsideUnavailable');
  }

  return { inside, insideDest, insideGeom, statusMsg, distanceDest, distanceGeom };
}
