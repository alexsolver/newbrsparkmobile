/**
 * Soma das distâncias em linha reta (haversine) entre vértices consecutivos [[lat,lng], ...].
 */
export function polylineLengthMeters(points: number[][]): number {
  if (!Array.isArray(points) || points.length < 2) return 0;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const lat1 = Number(a[0]);
    const lng1 = Number(a[1]);
    const lat2 = Number(b[0]);
    const lng2 = Number(b[1]);
    if (![lat1, lng1, lat2, lng2].every((x) => Number.isFinite(x))) continue;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    sum += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return sum;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
