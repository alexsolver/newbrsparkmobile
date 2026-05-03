import { Platform } from 'react-native';
import { isAutomaticDateTimeEnabled } from 'brspark-automatic-time';
import { API_BASE } from './appApiBase';

const SERVER_SKEW_MS = 3 * 60 * 1000;

export type DeviceTimeBlockReason = 'android_manual' | 'ios_clock_skew';

export type DeviceTimeGateResult =
  | { ok: true }
  | { ok: false; reason: DeviceTimeBlockReason };

/**
 * Bloqueia a app se:
 * - Android: data/hora ou fuso não estão em modo automático;
 * - iOS: não existe API pública — comparamos o relógio local com o cabeçalho Date de /api/config (requer rede).
 * Web: sem bloqueio.
 */
export async function evaluateDeviceTimeGate(): Promise<DeviceTimeGateResult> {
  if (Platform.OS === 'web') {
    return { ok: true };
  }

  if (Platform.OS === 'android') {
    if (!isAutomaticDateTimeEnabled()) {
      return { ok: false, reason: 'android_manual' };
    }
    return { ok: true };
  }

  if (Platform.OS === 'ios') {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const dh = res.headers.get('date');
      if (!dh) return { ok: true };
      const serverMs = Date.parse(dh);
      if (Number.isNaN(serverMs)) return { ok: true };
      if (Math.abs(Date.now() - serverMs) > SERVER_SKEW_MS) {
        return { ok: false, reason: 'ios_clock_skew' };
      }
      return { ok: true };
    } catch {
      // Offline-first: sem rede não bloqueamos só por iOS.
      return { ok: true };
    }
  }

  return { ok: true };
}
