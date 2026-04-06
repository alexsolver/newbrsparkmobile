import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type NativeModule = {
  isAutomaticDateTimeEnabled: () => boolean;
};

let native: NativeModule | null = null;

try {
  native = requireNativeModule<NativeModule>('BrsparkAutomaticTime');
} catch {
  native = null;
}

/**
 * Android: lê AUTO_TIME e AUTO_TIME_ZONE nas definições globais.
 * iOS: o nativo devolve sempre true — use `evaluateDeviceTimeGate` em JS para heurística de relógio.
 */
export function isAutomaticDateTimeEnabled(): boolean {
  if (Platform.OS !== 'android') return true;
  if (!native) return true;
  try {
    return native.isAutomaticDateTimeEnabled();
  } catch {
    return true;
  }
}
