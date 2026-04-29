import type { LocationObject } from 'expo-location';
import * as Location from 'expo-location';
import { getGpsCapturePolicy } from '../services/gpsCapturePolicyStore';

/**
 * Tempo máximo a aguardar fix em alta precisão antes de cair para Balanced
 * (alinhado ao timeout de reverse geocode em `ChecklistLocationPickField`).
 */
export const GPS_HIGH_ACCURACY_TIMEOUT_MS = 8000;

/**
 * Tenta `Accuracy.High` primeiro; se não responder a tempo, usa `Balanced`.
 * Reduz espera com GNSS lento (interior, simulador, cold start).
 */
export async function getCurrentPositionHighWithBalancedFallback(options?: {
  highTimeoutMs?: number;
}): Promise<LocationObject> {
  const highTimeoutMs = options?.highTimeoutMs ?? GPS_HIGH_ACCURACY_TIMEOUT_MS;
  try {
    const loc = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), highTimeoutMs)
      ),
    ]);
    return loc as LocationObject;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'timeout') {
      return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    }
    throw err;
  }
}

/**
 * Captura com `CollectionPolicy.gpsCapturePolicy` (GET /api/gps-capture-policy/me): `high_only` ou `high_then_balanced` + timeout.
 */
export async function getCurrentPositionWithGpsPolicy(options?: {
  highTimeoutMs?: number;
}): Promise<LocationObject> {
  const p = getGpsCapturePolicy();
  const timeoutMs =
    options?.highTimeoutMs ??
    (Number.isFinite(p.highAccuracyTimeoutMs) ? p.highAccuracyTimeoutMs : GPS_HIGH_ACCURACY_TIMEOUT_MS);

  if (p.accuracyMode === 'high_only') {
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  }
  return getCurrentPositionHighWithBalancedFallback({ highTimeoutMs: timeoutMs });
}
