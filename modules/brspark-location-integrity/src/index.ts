import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type NativeMod = {
  isMockLocationDeveloperSettingEnabled: () => boolean;
  isSoftwareSimulatedLocationAsync: () => Promise<boolean>;
};

let native: NativeMod | null = null;

try {
  native = requireNativeModule<NativeMod>('BrsparkLocationIntegrity');
} catch {
  native = null;
}

/** Android: app de localização fictícia selecionada nas opções de programador. */
export function isMockLocationDeveloperSettingEnabled(): boolean {
  if (Platform.OS !== 'android' || !native) return false;
  try {
    return native.isMockLocationDeveloperSettingEnabled();
  } catch {
    return false;
  }
}

/** iOS 15+: última posição do CLLocationManager com software simulado. */
export async function isIosSoftwareSimulatedLocation(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !native) return false;
  try {
    return await native.isSoftwareSimulatedLocationAsync();
  } catch {
    return false;
  }
}
