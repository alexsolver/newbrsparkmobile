import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getCurrentPositionWithGpsPolicy } from './getCurrentPositionWithAccuracyFallback';
import { Platform } from 'react-native';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system/legacy';
import type { WorkTimeDeviceInfo, WorkTimeSettingsPayload } from '../services/workTimeService';
import { ensureWorkTimeOutboxDir, faceImagePathForClientUuid as workTimeFacePath } from '../services/workTimePunchOutbox';
import { verifyFaceWithApi } from '../services/verifyFaceApi';

export type CollectedPunch = {
  /** Identificador estável da batida (fila offline / dedupe no servidor). */
  clientPunchUuid: string;
  deviceInfo: WorkTimeDeviceInfo;
  lat?: number;
  lng?: number;
  accuracy?: number;
  faceVerificationId?: string;
  faceScore?: number | null;
  faceEngine?: string | null;
  /** Há foto em disco (`clientPunchUuid.jpg`) para enviar ao verify-face quando houver rede. */
  faceImagePendingUpload?: boolean;
  collectionNotes: string[];
};

export function buildDeviceInfo(): WorkTimeDeviceInfo {
  return {
    brand: Device.brand ?? undefined,
    modelName: Device.modelName ?? undefined,
    osName: Device.osName ?? undefined,
    osVersion: Device.osVersion ?? undefined,
    deviceName: Device.deviceName ?? undefined,
    deviceYearClass: Device.deviceYearClass ?? undefined,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? undefined,
    nativeAppVersion: Constants.nativeAppVersion ?? undefined,
  };
}

export async function isLikelyOnline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    if (s?.isConnected === false) return false;
    /** `isInternetReachable === false` é frequente em LTE/VPN boas — ainda tentamos verify-face. */
    return true;
  } catch {
    return true;
  }
}

function newClientPunchUuid(): string {
  return `clt_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Recolhe GPS, foto e (se houver rede) verificação facial no servidor.
 * Sem rede ou se o verify-face falhar por conectividade, grava a imagem na pasta da fila de ponto.
 */
export async function collectPunchInputs(
  settings: WorkTimeSettingsPayload,
  userId: string | undefined
): Promise<CollectedPunch> {
  const deviceInfo = buildDeviceInfo();
  const collectionNotes: string[] = [];
  const online = await isLikelyOnline();
  const clientPunchUuid = newClientPunchUuid();

  let lat: number | undefined;
  let lng: number | undefined;
  let accuracy: number | undefined;

  const gperm = await Location.requestForegroundPermissionsAsync();
  if (gperm.status !== 'granted') {
    collectionNotes.push('GPS: permissão de localização negada.');
  } else {
    try {
      const pos = await getCurrentPositionWithGpsPolicy();
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      accuracy = pos.coords.accuracy ?? undefined;
      if (
        settings.minGpsAccuracyMeters != null &&
        accuracy != null &&
        accuracy > settings.minGpsAccuracyMeters
      ) {
        collectionNotes.push(
          `GPS: precisão (${Math.round(accuracy)} m) pior que o máximo permitido pelo tenant (${settings.minGpsAccuracyMeters} m).`
        );
      }
    } catch {
      collectionNotes.push('GPS: não foi possível obter a posição.');
    }
  }

  let faceVerificationId: string | undefined;
  let faceScore: number | null | undefined;
  let faceEngine: string | null | undefined;
  let faceImagePendingUpload: boolean | undefined;

  const cam = await ImagePicker.requestCameraPermissionsAsync();
  if (!cam.granted) {
    collectionNotes.push('Câmera: permissão negada.');
  } else {
    const shot = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    const asset = shot.canceled ? null : shot.assets?.[0];
    if (!asset) {
      collectionNotes.push('Rosto: captura cancelada ou sem imagem.');
    } else {
      let b64 = String(asset.base64 || '').trim();
      if (!b64 && asset.uri) {
        try {
          const pathOnly = String(asset.uri).split('?')[0];
          if (pathOnly) {
            const inf = await FileSystem.getInfoAsync(pathOnly);
            if (inf.exists) {
              b64 = await FileSystem.readAsStringAsync(pathOnly, { encoding: 'base64' });
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!b64) {
        collectionNotes.push('Rosto: captura cancelada ou sem imagem.');
      } else {
        const runVerify = async (): Promise<'ok' | 'definitive_fail' | 'network_fail'> => {
          const vr = await verifyFaceWithApi(b64, 'self_verify');
          if (vr.ok) {
            const j = vr.data;
            const uid = j?.identifiedUserId != null ? String(j.identifiedUserId) : userId || 'self';
            faceVerificationId = `vision:self_verify:${uid}:${Date.now()}`;
            faceScore = typeof j.confidence === 'number' ? j.confidence : null;
            faceEngine = typeof j.engine === 'string' ? j.engine : 'server';
            return 'ok';
          }
          if (vr.kind === 'error_msg') {
            collectionNotes.push(`Rosto: ${vr.message}`);
            return 'definitive_fail';
          }
          if (vr.kind === 'no_match') {
            collectionNotes.push(
              vr.message ? `Rosto: ${vr.message}` : 'Rosto: não corresponde ao cadastro.',
            );
            return 'definitive_fail';
          }
          return 'network_fail';
        };

        if (online) {
          const outcome = await runVerify();
          if (outcome === 'network_fail') {
            try {
              await ensureWorkTimeOutboxDir();
              const path = workTimeFacePath(clientPunchUuid);
              await FileSystem.writeAsStringAsync(path, b64, { encoding: 'base64' });
              faceImagePendingUpload = true;
              collectionNotes.push('Rosto: sem resposta do servidor; validação ficará pendente até haver rede.');
            } catch {
              collectionNotes.push('Rosto: não foi possível guardar a foto para envio posterior.');
            }
          }
        } else {
          try {
            await ensureWorkTimeOutboxDir();
            const path = workTimeFacePath(clientPunchUuid);
            await FileSystem.writeAsStringAsync(path, b64, { encoding: 'base64' });
            faceImagePendingUpload = true;
            collectionNotes.push('Rosto: sem rede; a foto será validada quando o envio for feito.');
          } catch {
            collectionNotes.push('Rosto: não foi possível guardar a foto para envio posterior.');
          }
        }
      }
    }
  }

  return {
    clientPunchUuid,
    deviceInfo,
    lat,
    lng,
    accuracy,
    faceVerificationId,
    faceScore,
    faceEngine,
    faceImagePendingUpload,
    collectionNotes,
  };
}
