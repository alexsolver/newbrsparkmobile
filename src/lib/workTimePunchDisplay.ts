import type { User } from '../services/auth';
import type { WorkTimeDeviceInfo } from '../services/workTimeService';

export function deriveEmployeeMatriculaFromUser(user: User | null | undefined): string {
  if (!user) return '';
  const explicit =
    user.employeeMatricula != null && String(user.employeeMatricula).trim()
      ? String(user.employeeMatricula).trim()
      : '';
  if (explicit) return explicit.slice(0, 80);
  const cft = user.technicianProfile?.cft;
  if (cft && String(cft).trim()) return String(cft).trim().slice(0, 80);
  const docs = Array.isArray(user.personalDocuments) ? user.personalDocuments : [];
  for (const d of docs) {
    if (d && typeof d === 'object' && 'identifier' in d && typeof (d as { identifier?: string }).identifier === 'string') {
      const id = (d as { identifier: string }).identifier.trim();
      if (id) return id.slice(0, 80);
    }
  }
  return user.id ? String(user.id) : '';
}

export function formatDeviceSummaryFromSnapshot(
  validationSnapshot: unknown,
  rawPayload: unknown
): string {
  let d: WorkTimeDeviceInfo | null = null;
  if (validationSnapshot && typeof validationSnapshot === 'object' && 'deviceInfo' in validationSnapshot) {
    const di = (validationSnapshot as { deviceInfo?: unknown }).deviceInfo;
    if (di && typeof di === 'object') d = di as WorkTimeDeviceInfo;
  }
  if (!d && rawPayload && typeof rawPayload === 'object' && 'deviceInfoClient' in rawPayload) {
    const di = (rawPayload as { deviceInfoClient?: unknown }).deviceInfoClient;
    if (di && typeof di === 'object') d = di as WorkTimeDeviceInfo;
  }
  if (!d) return '';
  const parts: string[] = [];
  const brandModel = [d.brand, d.modelName].filter((x) => x && String(x).trim()).map(String);
  if (brandModel.length) parts.push(brandModel.join(' ').trim());
  const os = [d.osName, d.osVersion].filter((x) => x && String(x).trim()).map(String);
  if (os.length) parts.push(os.join(' ').trim());
  const appV = d.appVersion || d.nativeAppVersion;
  if (appV) parts.push(`App ${String(appV).trim()}`);
  if (d.deviceName && String(d.deviceName).trim()) parts.push(String(d.deviceName).trim());
  if (d.platform) parts.push(String(d.platform));
  return parts.filter(Boolean).join(' · ');
}

export function formatGpsLine(lat: number | null | undefined, lng: number | null | undefined, accuracy: number | null | undefined): string {
  if (lat == null || lng == null) return '';
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return '';
  const acc = accuracy != null && Number.isFinite(Number(accuracy)) ? Math.round(Number(accuracy)) : null;
  const accPart = acc != null ? ` · precisão ±${acc} m` : '';
  return `${la.toFixed(6)}, ${lo.toFixed(6)}${accPart}`;
}
