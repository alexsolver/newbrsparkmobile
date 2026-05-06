import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { apiFetch } from './auth';
import { verifyFaceWithApi } from './verifyFaceApi';
import {
  isConnectivityFailure,
  postWorkTimePunch,
  WorkTimePunchRequestError,
  type PostWorkTimePunchBody,
  type WorkTimeDeviceInfo,
  type WorkTimePunchRow,
  type WorkTimePunchType,
} from './workTimeService';
import { emitWorkTimeJourneyChanged } from '../lib/workTimeJourneyEvents';

const OUTBOX_KEY = '@aria_work_time_punch_outbox';
const SUBDIR = 'work-time-outbox/';

function docBase(): string {
  return FileSystem.documentDirectory || '';
}

export function workTimeOutboxAbsoluteDir(): string {
  return `${docBase()}${SUBDIR}`;
}

export function faceImagePathForClientUuid(clientUuid: string): string {
  return `${workTimeOutboxAbsoluteDir()}${clientUuid}.jpg`;
}

export async function ensureWorkTimeOutboxDir(): Promise<void> {
  const dir = workTimeOutboxAbsoluteDir();
  if (!dir) return;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export type WorkTimeOutboxPunch = {
  clientPunchUuid: string;
  type: WorkTimePunchType;
  deviceTimestamp: string;
  offlineQueuedAt: string;
  exceptionRegistration: boolean;
  exceptionJustification?: string;
  deviceInfo: WorkTimeDeviceInfo;
  lat?: number;
  lng?: number;
  accuracy?: number;
  faceVerificationId?: string;
  faceScore?: number | null;
  faceEngine?: string | null;
  /** Foto em disco `{clientPunchUuid}.jpg` a enviar ao verify-face antes do POST. */
  faceImagePendingUpload?: boolean;
  /** E-mail / login do utilizador no momento da batida (auditoria no `rawPayload`). */
  appUserLogin?: string | null;
  collectionNotes: string[];
  lastError?: string;
};

async function readOutbox(): Promise<WorkTimeOutboxPunch[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: WorkTimeOutboxPunch[]): Promise<void> {
  if (items.length === 0) await AsyncStorage.removeItem(OUTBOX_KEY);
  else await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

async function deleteFaceFileIfAny(item: WorkTimeOutboxPunch): Promise<void> {
  if (!item.faceImagePendingUpload) return;
  const path = faceImagePathForClientUuid(item.clientPunchUuid);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ignore */
  }
}

export function outboxItemsToDisplayRows(items: WorkTimeOutboxPunch[]): WorkTimePunchRow[] {
  return items.map((it) => ({
    id: `local-${it.clientPunchUuid}`,
    type: it.type,
    deviceTimestamp: it.deviceTimestamp,
    formattedAddress: null,
    lat: it.lat ?? null,
    lng: it.lng ?? null,
    accuracy: it.accuracy ?? null,
    validationSnapshot: {
      deviceInfo: it.deviceInfo,
      gps: { lat: it.lat, lng: it.lng, accuracy: it.accuracy },
    },
    rawPayload: it.appUserLogin && String(it.appUserLogin).trim()
      ? { appUserLogin: String(it.appUserLogin).trim() }
      : undefined,
    faceEnrollmentInvalid: null,
    faceVerificationId: it.faceVerificationId ?? null,
    exceptionRegistration: it.exceptionRegistration,
    exceptionJustification: it.exceptionJustification ?? null,
    syncPending: true,
    syncPendingError: it.lastError ?? null,
  }));
}

export async function getWorkTimeOutboxForDisplay(): Promise<WorkTimePunchRow[]> {
  const q = await readOutbox();
  return outboxItemsToDisplayRows(q);
}

export async function enqueueWorkTimePunch(item: Omit<WorkTimeOutboxPunch, 'lastError'>): Promise<void> {
  const q = await readOutbox();
  q.push({ ...item });
  await writeOutbox(q);
  emitWorkTimeJourneyChanged();
}

let punchOutboxPushInFlight = false;

/**
 * Envia batidas guardadas localmente (validação facial no servidor só quando há rede).
 * Chamado a partir de `pushSyncQueue` e ao atualizar o ecrã de ponto.
 */
export async function pushWorkTimePunchOutbox(): Promise<void> {
  if (punchOutboxPushInFlight) return;
  punchOutboxPushInFlight = true;
  try {
    const q = await readOutbox();
    if (q.length === 0) return;

    const remaining: WorkTimeOutboxPunch[] = [];

    for (const item of q) {
      try {
        let faceVerificationId = item.faceVerificationId;
        let faceScore = item.faceScore;
        let faceEngine = item.faceEngine;

        if (item.faceImagePendingUpload && !faceVerificationId) {
          const path = faceImagePathForClientUuid(item.clientPunchUuid);
          const finfo = await FileSystem.getInfoAsync(path);
          if (!finfo.exists) {
            remaining.push({
              ...item,
              lastError: 'Arquivo da foto facial em falta; tire outra foto ao bater o ponto.',
            });
            continue;
          }
          const imageBase64 = await FileSystem.readAsStringAsync(path, { encoding: 'base64' });
          const vr = await verifyFaceWithApi(imageBase64, 'self_verify');
          if (!vr.ok) {
            if (vr.kind === 'network') {
              remaining.push(item);
              continue;
            }
            const msg =
              vr.kind === 'error_msg'
                ? vr.message
                : typeof vr.message === 'string'
                  ? vr.message
                  : 'Rosto não corresponde ao cadastro.';
            remaining.push({ ...item, lastError: msg });
            continue;
          }
          const j = vr.data;
          const uid = j?.identifiedUserId != null ? String(j.identifiedUserId) : 'self';
          faceVerificationId = `vision:self_verify:${uid}:${Date.now()}`;
          faceScore = typeof j.confidence === 'number' ? j.confidence : null;
          faceEngine = typeof j.engine === 'string' ? j.engine : 'server';
        }

        const body: PostWorkTimePunchBody = {
          type: item.type,
          deviceTimestamp: item.deviceTimestamp,
          lat: item.lat,
          lng: item.lng,
          accuracy: item.accuracy,
          faceVerificationId,
          faceScore,
          faceEngine,
          deviceInfo: item.deviceInfo,
          exceptionRegistration: item.exceptionRegistration,
          exceptionJustification: item.exceptionJustification,
          offlineDeferredSubmission: true,
          offlineQueuedAt: item.offlineQueuedAt,
          clientPunchUuid: item.clientPunchUuid,
          rawPayload: {
            offlineOutbox: true,
            collectionNotes: item.collectionNotes,
            ...(item.appUserLogin && String(item.appUserLogin).trim()
              ? { appUserLogin: String(item.appUserLogin).trim() }
              : {}),
          },
        };

        await postWorkTimePunch(body);
        await deleteFaceFileIfAny(item);
      } catch (e) {
        if (isConnectivityFailure(e)) {
          remaining.push(item);
          continue;
        }
        if (e instanceof WorkTimePunchRequestError) {
          remaining.push({
            ...item,
            lastError: e.message || 'Validação rejeitada pelo servidor.',
          });
          continue;
        }
        const msg = e instanceof Error ? e.message : String(e);
        remaining.push({ ...item, lastError: msg });
      }
    }

    await writeOutbox(remaining);
    emitWorkTimeJourneyChanged();
  } finally {
    punchOutboxPushInFlight = false;
  }
}
