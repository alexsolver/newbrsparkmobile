import { Platform } from 'react-native';
import * as Location from 'expo-location';
import {
  isMockLocationDeveloperSettingEnabled,
  isIosSoftwareSimulatedLocation,
} from 'brspark-location-integrity';

export type GpsIntegrityFailReason =
  | 'android_mock_settings'
  | 'android_position_mocked'
  | 'ios_simulated';

const POSITION_PROBE_MS = 9000;

/**
 * Bloqueia quando há indício de localização fictícia (Fake GPS / simulação).
 * Android: definição de app fictício nas opções de programador e/ou fix reportado como mock.
 * iOS: posição marcada como simulada por software (ex.: Xcode) quando disponível; expo-location `mocked` se existir.
 */
export async function evaluateGpsIntegrityGate(): Promise<
  { ok: true } | { ok: false; reason: GpsIntegrityFailReason }
> {
  if (Platform.OS === 'web') return { ok: true };

  if (Platform.OS === 'android') {
    if (isMockLocationDeveloperSettingEnabled()) {
      return { ok: false, reason: 'android_mock_settings' };
    }
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === Location.PermissionStatus.GRANTED) {
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<Location.LocationObject | null>((resolve) =>
            setTimeout(() => resolve(null), POSITION_PROBE_MS)
          ),
        ]);
        if (pos && pos.mocked === true) {
          return { ok: false, reason: 'android_position_mocked' };
        }
      }
    } catch {
      /* sem fix — não bloquear */
    }
    return { ok: true };
  }

  if (Platform.OS === 'ios') {
    if (await isIosSoftwareSimulatedLocation()) {
      return { ok: false, reason: 'ios_simulated' };
    }
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === Location.PermissionStatus.GRANTED) {
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<Location.LocationObject | null>((resolve) =>
            setTimeout(() => resolve(null), POSITION_PROBE_MS)
          ),
        ]);
        if (pos && pos.mocked === true) {
          return { ok: false, reason: 'ios_simulated' };
        }
      }
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  return { ok: true };
}
