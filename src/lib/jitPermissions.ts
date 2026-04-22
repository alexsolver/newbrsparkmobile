import { Alert } from 'react-native';
import type { TFunction } from 'i18next';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

/**
 * Just-in-time: localização para diretório de serviços / prestadores próximos.
 * Mostra a justificativa antes do pedido nativo do sistema.
 */
export function confirmJitLocationForServices(t: TFunction): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('jitPermissions.locationTitle'),
      t('jitPermissions.locationMessage'),
      [
        { text: t('jitPermissions.notNow'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: t('jitPermissions.continue'),
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function requestForegroundLocationAfterRationale(t: TFunction): Promise<boolean> {
  const ok = await confirmJitLocationForServices(t);
  if (!ok) return false;
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

/**
 * Just-in-time: câmera / galeria para fotos de ativos ou evidências.
 */
export function confirmJitMediaForPhotos(t: TFunction): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('jitPermissions.mediaTitle'),
      t('jitPermissions.mediaMessage'),
      [
        { text: t('jitPermissions.notNow'), style: 'cancel', onPress: () => resolve(false) },
        {
          text: t('jitPermissions.continue'),
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export async function ensureCameraPermissionAfterRationale(t: TFunction): Promise<boolean> {
  const ok = await confirmJitMediaForPhotos(t);
  if (!ok) return false;
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

export async function ensureLibraryPermissionAfterRationale(t: TFunction): Promise<boolean> {
  const ok = await confirmJitMediaForPhotos(t);
  if (!ok) return false;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}
