import { apiFetch } from './auth';

/** Alinhado ao backend `gpsCapturePolicy.js` / `normalizeGpsCapturePolicy`. */
export type GpsCapturePolicy = {
  schemaVersion: number;
  accuracyMode: 'high_only' | 'high_then_balanced';
  highAccuracyTimeoutMs: number;
  trailOutlierMaxSpeedMps: number | null;
  trailIgnoreAccuracyAboveM: number | null;
  warmupBalancedWhileChecklistFocused: boolean;
};

export const DEFAULT_GPS_CAPTURE_POLICY: GpsCapturePolicy = {
  schemaVersion: 1,
  accuracyMode: 'high_then_balanced',
  highAccuracyTimeoutMs: 8000,
  trailOutlierMaxSpeedMps: 45,
  trailIgnoreAccuracyAboveM: null,
  warmupBalancedWhileChecklistFocused: true,
};

let memoryPolicy: GpsCapturePolicy = { ...DEFAULT_GPS_CAPTURE_POLICY };

function coercePolicy(raw: unknown): GpsCapturePolicy {
  const base = { ...DEFAULT_GPS_CAPTURE_POLICY };
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  const mode = String(o.accuracyMode || '').toLowerCase();
  if (mode === 'high_only' || mode === 'high_then_balanced') base.accuracyMode = mode;
  const ht = parseInt(String(o.highAccuracyTimeoutMs ?? ''), 10);
  if (Number.isFinite(ht) && ht >= 2000 && ht <= 120000) base.highAccuracyTimeoutMs = ht;
  const spd = o.trailOutlierMaxSpeedMps;
  if (spd === null || spd === '') base.trailOutlierMaxSpeedMps = null;
  else {
    const n = Number(spd);
    if (Number.isFinite(n) && n > 0 && n <= 200) base.trailOutlierMaxSpeedMps = n;
    else if (Number.isFinite(n) && n <= 0) base.trailOutlierMaxSpeedMps = null;
  }
  const accIgn = o.trailIgnoreAccuracyAboveM;
  if (accIgn === null || accIgn === '') base.trailIgnoreAccuracyAboveM = null;
  else {
    const n = parseInt(String(accIgn), 10);
    if (Number.isFinite(n) && n >= 5 && n <= 500) base.trailIgnoreAccuracyAboveM = n;
  }
  if (typeof o.warmupBalancedWhileChecklistFocused === 'boolean') {
    base.warmupBalancedWhileChecklistFocused = o.warmupBalancedWhileChecklistFocused;
  }
  return base;
}

export function getGpsCapturePolicy(): GpsCapturePolicy {
  return memoryPolicy;
}

export function setGpsCapturePolicy(next: GpsCapturePolicy): void {
  memoryPolicy = { ...DEFAULT_GPS_CAPTURE_POLICY, ...next };
}

/** Aplica política vinda do GET /api/gps-capture-policy/me. */
export function applyGpsCapturePolicyFromPayload(raw: unknown): void {
  setGpsCapturePolicy(coercePolicy(raw));
}

export function resetGpsCapturePolicyToDefaults(): void {
  memoryPolicy = { ...DEFAULT_GPS_CAPTURE_POLICY };
}

export type GpsCapturePolicyMeResponse = {
  tenantId: string;
  policy: GpsCapturePolicy;
};

export async function fetchGpsCapturePolicyMe(): Promise<GpsCapturePolicy | null> {
  try {
    const res = await apiFetch('/api/gps-capture-policy/me');
    const data = (await res.json().catch(() => ({}))) as Partial<GpsCapturePolicyMeResponse> & { error?: string };
    if (!res.ok || !data?.policy) {
      return null;
    }
    const p = coercePolicy(data.policy);
    setGpsCapturePolicy(p);
    return p;
  } catch {
    return null;
  }
}

