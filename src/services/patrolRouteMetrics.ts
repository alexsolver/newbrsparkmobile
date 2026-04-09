/**
 * Métricas de patrulha: cobertura ao longo da polilinha de referência (KML / OS),
 * desvio máximo e comprimento do trajeto GPS — para certificação / PDF.
 */

export type PatrolSample = { lat: number; lng: number; accuracy?: number };

export type PatrolComplianceResult = {
  coveragePercent: number;
  checkpointsTotal: number;
  checkpointsCovered: number;
  maxDeviationM: number;
  samplesUsed: number;
  samplesDiscardedAccuracy: number;
  referenceLengthM: number;
  /** Comprimento total da polilinha GPS (vértice a vértice). */
  trajectoryLengthM: number;
  /** Soma dos segmentos GPS cujo ponto médio está dentro do corredor (≤ tolerância) relativamente à referência. */
  trajectoryOnRouteM: number;
  toleranceM: number;
  referenceFingerprint: string;
  version: 1;
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a1 = Number(lat1);
  const o1 = Number(lng1);
  const a2 = Number(lat2);
  const o2 = Number(lng2);
  if (![a1, o1, a2, o2].every((x) => Number.isFinite(x))) return Infinity;
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Comprimento total da polilinha (metros). */
export function polylineLengthMetersLatLng(points: number[][]): number {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const d = haversineMeters(Number(a[0]), Number(a[1]), Number(b[0]), Number(b[1]));
    if (Number.isFinite(d)) sum += d;
  }
  return sum;
}

function projectPointOnPolyline(
  lat: number,
  lng: number,
  ref: number[][]
): { distM: number; arcLen: number } {
  if (!ref || ref.length < 2) return { distM: Infinity, arcLen: 0 };
  let minDist = Infinity;
  let arcAtClosest = 0;
  let cum = 0;
  for (let i = 0; i < ref.length - 1; i++) {
    const [aL, aG] = ref[i];
    const [bL, bG] = ref[i + 1];
    const segLen = haversineMeters(aL, aG, bL, bG);
    const dx = bG - aG;
    const dy = bL - aL;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((lng - aG) * dx + (lat - aL) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const pL = aL + t * dy;
    const pG = aG + t * dx;
    const d = haversineMeters(lat, lng, pL, pG);
    const arc = cum + t * segLen;
    if (d < minDist) {
      minDist = d;
      arcAtClosest = arc;
    }
    cum += segLen;
  }
  return { distM: minDist, arcLen: arcAtClosest };
}

function fingerprintReference(ref: number[][]): string {
  if (!ref || ref.length === 0) return '0';
  const a = ref[0];
  const b = ref[ref.length - 1];
  const h =
    ref.length * 10007 +
    Math.round((a[0] || 0) * 1e5) * 31 +
    Math.round((a[1] || 0) * 1e5) * 17 +
    Math.round((b[0] || 0) * 1e5) * 13 +
    Math.round((b[1] || 0) * 1e5);
  return `r1_${h.toString(36)}_${ref.length}`;
}

/**
 * @param reference — [[lat,lng], ...] rota planeada
 * @param samples — pontos GPS com accuracy opcional (metros)
 * @param opts.toleranceM — corredor (ex.: locationRadius na OS tipo rota)
 * @param opts.maxAccuracyM — se definido, descarta amostras com accuracy pior
 * @param opts.checkpointEveryM — espaçamento dos pontos de cobertura ao longo da referência
 */
export function computePatrolCompliance(
  reference: number[][],
  samples: PatrolSample[],
  opts: {
    toleranceM: number;
    maxAccuracyM?: number | null;
    checkpointEveryM?: number;
  }
): PatrolComplianceResult {
  const toleranceM = Math.max(5, Number(opts.toleranceM) || 80);
  const checkpointEveryM = Math.max(10, Number(opts.checkpointEveryM) || 25);
  const maxAcc = opts.maxAccuracyM;

  const ref = (reference || []).filter(
    (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])
  );
  const refLen = polylineLengthMetersLatLng(ref);

  let discarded = 0;
  const used: PatrolSample[] = [];
  for (const s of samples || []) {
    const la = Number(s.lat);
    const ln = Number(s.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    if (maxAcc != null && Number.isFinite(Number(s.accuracy)) && Number(s.accuracy) > maxAcc) {
      discarded++;
      continue;
    }
    used.push(s);
  }

  let trajLen = 0;
  for (let i = 1; i < used.length; i++) {
    trajLen += haversineMeters(used[i - 1].lat, used[i - 1].lng, used[i].lat, used[i].lng);
  }

  let maxDev = 0;
  const coveredIdx = new Set<number>();

  /** Segmento conta para "no corredor" se o ponto médio do segmento está ≤ tolerância (mais estável que exigir os dois extremos). */
  let onRouteM = 0;
  if (ref.length >= 2 && refLen >= 1) {
    for (let i = 1; i < used.length; i++) {
      const a = used[i - 1];
      const b = used[i];
      const midLat = (a.lat + b.lat) / 2;
      const midLng = (a.lng + b.lng) / 2;
      const dm = projectPointOnPolyline(midLat, midLng, ref).distM;
      if (Number.isFinite(dm) && dm <= toleranceM) {
        onRouteM += haversineMeters(a.lat, a.lng, b.lat, b.lng);
      }
    }
  }

  if (ref.length < 2 || refLen < 1) {
    return {
      coveragePercent: 0,
      checkpointsTotal: 0,
      checkpointsCovered: 0,
      maxDeviationM: Math.round(maxDev),
      samplesUsed: used.length,
      samplesDiscardedAccuracy: discarded,
      referenceLengthM: Math.round(refLen),
      trajectoryLengthM: Math.round(trajLen),
      trajectoryOnRouteM: Math.round(onRouteM),
      toleranceM,
      referenceFingerprint: fingerprintReference(ref),
      version: 1,
    };
  }

  const nCheck = Math.max(1, Math.ceil(refLen / checkpointEveryM));
  const checkpointsTotal = nCheck;

  for (const s of used) {
    const { distM, arcLen } = projectPointOnPolyline(s.lat, s.lng, ref);
    if (Number.isFinite(distM)) maxDev = Math.max(maxDev, distM);
    if (distM <= toleranceM) {
      const centerIdx = Math.round((arcLen / refLen) * (nCheck - 1));
      for (let d = -1; d <= 1; d++) {
        const j = centerIdx + d;
        if (j >= 0 && j < nCheck) coveredIdx.add(j);
      }
    }
  }

  const coveragePercent =
    checkpointsTotal > 0 ? Math.round((100 * coveredIdx.size) / checkpointsTotal) : 0;

  return {
    coveragePercent: Math.min(100, coveragePercent),
    checkpointsTotal,
    checkpointsCovered: coveredIdx.size,
    maxDeviationM: Math.round(maxDev),
    samplesUsed: used.length,
    samplesDiscardedAccuracy: discarded,
    referenceLengthM: Math.round(refLen),
    trajectoryLengthM: Math.round(trajLen),
    trajectoryOnRouteM: Math.round(onRouteM),
    toleranceM,
    referenceFingerprint: fingerprintReference(ref),
    version: 1,
  };
}
