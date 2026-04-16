/**
 * Proxy BrSpark → Google Routes API (cota por tenant no servidor).
 * Falha silenciosa (null) para o checklist continuar com OSRM.
 */
import { apiFetch } from './auth';

export async function fetchGoogleDrivingLegMetricsOrNull(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  options?: { timeoutMs?: number }
): Promise<{ ok: true; durationSeconds: number; distanceMeters?: number } | null> {
  try {
    const res = await apiFetch('/api/maps/google/route-metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originLat, originLng, destLat, destLng }),
      timeoutMs: options?.timeoutMs ?? 22000,
    });
    const j: any = await res.json().catch(() => null);
    if (!res.ok || !j || j.ok !== true || j.durationSeconds == null) return null;
    const dur = Math.round(Number(j.durationSeconds));
    if (!Number.isFinite(dur) || dur < 0) return null;
    const dm =
      j.distanceMeters != null && Number.isFinite(Number(j.distanceMeters))
        ? Math.round(Number(j.distanceMeters))
        : undefined;
    return { ok: true, durationSeconds: dur, distanceMeters: dm };
  } catch {
    return null;
  }
}
