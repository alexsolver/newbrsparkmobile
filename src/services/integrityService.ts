/**
 * integrityService — BrSpark Field Service
 *
 * Detecta anomalias de integridade no dispositivo:
 *   - Mock Location (GPS falso / simulado)
 *   - Clock Drift (relógio do aparelho fora de sincronia com o servidor)
 *   - Root / Jailbreak (via expo-device + heurísticas)
 *
 * Retorna um IntegritySnapshot consumido pelo dataCollectionService.
 */
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';

export interface IntegritySnapshot {
  isMockLocation: boolean;
  isRooted: boolean;
  clockDriftMs: number | null;
  networkType: 'WIFI' | '4G' | '5G' | 'OFFLINE' | 'UNKNOWN';
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  appVersion: string;
  osVersion: string;
  deviceModel: string;
  deviceId: string;
}

// ── Mock GPS detection ──────────────────────────────────────────────────────
// Expo Location does not expose isMockProvider directly, so we use heuristics:
// 1. Accuracy suspiciously perfect (== 0 or exactly 1.0 m)
// 2. Speed unrealistically high while device is obviously static
// 3. Location changes jump by huge distance in < 1 second
let _lastKnownLoc: { lat: number; lng: number; ts: number } | null = null;

export function detectMockLocation(lat: number, lng: number, accuracy: number | null): boolean {
  // Perfect accuracy is suspicious — real GPS rarely hits < 2m
  if (accuracy !== null && accuracy <= 1.0) return true;

  const now = Date.now();
  if (_lastKnownLoc) {
    const elapsedSec = (now - _lastKnownLoc.ts) / 1000;
    if (elapsedSec > 0 && elapsedSec < 2) {
      // Haversine distance in meters
      const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
      const dLat = toRad(lat - _lastKnownLoc.lat);
      const dLng = toRad(lng - _lastKnownLoc.lng);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(_lastKnownLoc.lat)) * Math.cos(toRad(lat)) *
        Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      // > 100 km/h instant jump is physically impossible while holding a phone still
      const speedMs = dist / elapsedSec;
      if (speedMs > 60) return true; // > 216 km/h between consecutive points
    }
  }
  _lastKnownLoc = { lat, lng, ts: now };
  return false;
}

// ── Root / Jailbreak detection (heuristic) ──────────────────────────────────
function detectRootJailbreak(): boolean {
  // expo-device gives isDevice=false on simulators (not root detection per se)
  if (!Device.isDevice) return false; // simulator — not rooted, just dev

  // On iOS: jailbroken devices sometimes expose these paths via native bridge
  // On Android: rooted devices expose Build.TAGS = 'test-keys'
  // We can only do basic checks from JS; native detection requires an EAS build module
  // Flag as suspicious if:
  // 1. Platform is Android and device fingerprint looks like 'generic' (emulator)
  if (Platform.OS === 'android') {
    const brand = (Device.brand || '').toLowerCase();
    const manufacturer = (Device.manufacturer || '').toLowerCase();
    if (brand === 'generic' || manufacturer === 'genymotion') return true;
  }
  return false;
}

// ── Clock drift detection ───────────────────────────────────────────────────
let _serverTimeDiff: number | null = null; // ms: positive = device ahead of server

export async function measureClockDrift(): Promise<number | null> {
  try {
    const t0 = Date.now();
    const res = await apiFetch('/health');
    const t1 = Date.now();
    if (!res.ok) return _serverTimeDiff;
    const body = await res.json();
    if (!body.ts) return _serverTimeDiff;
    const serverTs  = new Date(body.ts).getTime();
    const roundTrip = (t1 - t0) / 2;
    _serverTimeDiff = Math.round(t0 + roundTrip - serverTs);
    return _serverTimeDiff;
  } catch {
    return _serverTimeDiff;
  }
}

async function getNetworkType(): Promise<IntegritySnapshot['networkType']> {
  // Mocked for now to prevent ExpoNetwork native module crash.
  // The Dev Client needs to be rebuilt to include expo-network's native iOS/Android code.
  return 'UNKNOWN';
}

// ── Battery ─────────────────────────────────────────────────────────────────
async function getBattery(): Promise<{ level: number | null; charging: boolean | null }> {
  // Mocked for now to prevent ExpoBattery native module crash.
  // Requires iOS/Android Dev Client rebuild.
  return { level: null, charging: null };
}

// ── Pseudonymized deviceId ───────────────────────────────────────────────────
async function getDeviceId(): Promise<string> {
  const KEY = '@brspark_device_id';
  try {
    let id = await AsyncStorage.getItem(KEY);
    if (!id) {
      // Generate stable pseudo-ID from device properties
      const raw = `${Device.modelId || ''}${Device.osVersion || ''}${Date.now()}`;
      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
      }
      id = `dev_${Math.abs(hash).toString(36)}`;
      await AsyncStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

// ── Main snapshot builder ────────────────────────────────────────────────────
export async function getIntegritySnapshot(
  lat?: number, lng?: number, accuracy?: number
): Promise<IntegritySnapshot> {
  const [battery, networkType, clockDriftMs, deviceId] = await Promise.all([
    getBattery(),
    getNetworkType(),
    measureClockDrift(),
    getDeviceId(),
  ]);

  const isMockLocation = (lat !== undefined && lng !== undefined)
    ? detectMockLocation(lat, lng, accuracy ?? null)
    : false;

  const isRooted = detectRootJailbreak();

  return {
    isMockLocation,
    isRooted,
    clockDriftMs,
    networkType,
    batteryLevel:   battery.level,
    batteryCharging: battery.charging,
    appVersion:  (require('expo-constants').default.expoConfig?.version) || '1.0',
    osVersion:   Device.osVersion   || 'unknown',
    deviceModel: Device.modelName   || Device.deviceName || 'unknown',
    deviceId,
  };
}
