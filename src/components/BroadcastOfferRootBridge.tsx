/**
 * Sempre montado no layout raiz: sincroniza ofertas broadcast após `pullTasks` (cache local)
 * quando o dashboard não está montado (ex.: checklist / mapa de deslocamento) e mantém
 * os handlers de aceitar/recusar ativos — o registo no `index` desmontava com `(client)`.
 */
import React, { useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useConnectivity } from '../hooks/useConnectivity';
import { useAppContext } from '../context/AppContext';
import { useProviderBroadcastOffer } from '../context/ProviderBroadcastOfferContext';
import { BRSPARK_CLOUD_TASKS_UPDATED } from '../constants/deviceEvents';
import { loadAllCloudTasksForExecutionLookup, patchCloudTaskById } from '../lib/cloudTasksBuckets';
import { appendUniqueStringToStoredArray } from '../lib/asyncStorageAtomic';
import { apiFetch } from '../services/auth';
import i18n from '../i18n';
import { enqueueExecutionStatusPatch, pullTasks } from '../services/syncService';
import {
  getBroadcastOsUnavailableSubtitle,
  getBroadcastOsUnavailableTitle,
} from '../constants/broadcastOsMessages';

async function enqueueExecutionInProgressFromDashboard(taskId: string): Promise<void> {
  const id = String(taskId || '').trim();
  if (!id) return;
  const ts = new Date().toISOString();
  await enqueueExecutionStatusPatch(id, {
    status: 'IN_PROGRESS',
    timestamp: ts,
    metadata: { executionPaused: false, lastResumedAt: ts },
  });
  try {
    await patchCloudTaskById(id, (row) => ({
      ...row,
      status: 'IN_PROGRESS',
      metadata: {
        ...(row.metadata || {}),
        executionPaused: false,
        lastResumedAt: ts,
      },
    }));
  } catch {
    /* ignore */
  }
}

const BROADCAST_OFFERS_REFRESH_DEBOUNCE_MS = 280;

/** Ordem estável: o dashboard ordena por «recentes»; o cache FT+RT não — alternar o 1.º item fazia o sheet reabrir e «saltar». */
function broadcastClaimExpiresAtMs(t: any): number {
  const m = t?.metadata;
  const meta =
    m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
  const raw =
    meta.broadcastClaimExpiresAt ??
    meta.broadcastOfferExpiresAt ??
    t?.broadcastClaimExpiresAt ??
    null;
  if (raw == null || String(raw).trim() === '') return Number.POSITIVE_INFINITY;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

function sortBroadcastOfferQueueStable(tasks: any[]): any[] {
  return [...tasks].sort((a, b) => {
    const ea = broadcastClaimExpiresAtMs(a);
    const eb = broadcastClaimExpiresAtMs(b);
    if (ea !== eb) return ea - eb;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

/**
 * Identidade da fila para `setBroadcastOfferTasks`: só **ids na ordem de sort** (expiração já ordena em
 * `sortBroadcastOfferQueueStable`). Incluir ISO de expiração na assinatura fazia cada `pullTasks`/sync
 * gerar `nextSig` diferente com as **mesmas** OS → novo array → re-renders contínuos e popup da folha
 * com 2+ ofertas até a UI «quebrar» / sumir do rodapé.
 */
function broadcastOfferQueueSig(tasks: any[]): string {
  const sorted = sortBroadcastOfferQueueStable(Array.isArray(tasks) ? tasks : []);
  return sorted.map((t) => String(t?.id ?? '')).join('|');
}

async function loadRejectedTaskIdsForBroadcast(): Promise<Set<string>> {
  try {
    const rStr = await AsyncStorage.getItem('@brspark_rejected_tasks') || '[]';
    const rejArr = JSON.parse(rStr);
    if (!Array.isArray(rejArr)) return new Set();
    return new Set(rejArr.map((id: unknown) => String(id || '').trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function applyBroadcastOffersFromCache(
  setBroadcastOfferTasks: Dispatch<SetStateAction<any[]>>
) {
  const [all, rejectedIds] = await Promise.all([
    loadAllCloudTasksForExecutionLookup(),
    loadRejectedTaskIdsForBroadcast(),
  ]);
  /** Mesmo `id` pode aparecer em RT+FT ou duplicado no JSON — duas entradas trocavam a ordem da fila a cada leitura e disparavam efeitos da folha. */
  const byId = new Map<string, any>();
  for (const t of all) {
    if (!Boolean(t?.broadcastClaimPending)) continue;
    const id = String(t?.id || '').trim();
    if (!id || rejectedIds.has(id)) continue;
    byId.set(id, t);
  }
  const pending = sortBroadcastOfferQueueStable([...byId.values()]);
  const nextSig = broadcastOfferQueueSig(pending);
  setBroadcastOfferTasks((prev) => {
    const prevSig = broadcastOfferQueueSig(prev);
    const unchanged = prevSig === nextSig;
    if (unchanged) return prev;
    return pending;
  });
}

export function BroadcastOfferRootBridge() {
  const { userRole, user } = useAuth();
  const { mode } = useAppContext();
  const { isOnline } = useConnectivity();
  const router = useRouter();
  const { setBroadcastOfferTasks, registerBroadcastOfferHandlers } = useProviderBroadcastOffer();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshOffersIfEligible = useCallback(() => {
    if (String(userRole || '').toUpperCase() !== 'TECHNICIAN' || mode !== 'PROVIDER') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setBroadcastOfferTasks([]);
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void applyBroadcastOffersFromCache(setBroadcastOfferTasks);
    }, BROADCAST_OFFERS_REFRESH_DEBOUNCE_MS);
  }, [userRole, mode, setBroadcastOfferTasks]);

  /** Após recusar: aplica já (sem esperar o debounce) para não «voltar» a OS ao ecrã. */
  const applyBroadcastOffersImmediate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    void applyBroadcastOffersFromCache(setBroadcastOfferTasks);
  }, [setBroadcastOfferTasks]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(BRSPARK_CLOUD_TASKS_UPDATED, refreshOffersIfEligible);
    return () => sub.remove();
  }, [refreshOffersIfEligible]);

  useEffect(() => {
    refreshOffersIfEligible();
  }, [refreshOffersIfEligible]);

  useEffect(() => {
    registerBroadcastOfferHandlers({
      onAccept: async (selectedTask: any) => {
        const taskIdStr = String(selectedTask.id);
        if (!selectedTask.refId) {
          Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.home.formMissingOs'));
          return;
        }
        if (isOnline === false) {
          Alert.alert(
            i18n.t('appAlerts.home.offlineClaimTitle'),
            i18n.t('appAlerts.home.offlineClaimBody'),
          );
          return;
        }
        try {
          const res = await apiFetch(`/api/checklists/executions/${encodeURIComponent(taskIdStr)}/claim`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          const rawBody = await res.text();
          let data: Record<string, unknown> = {};
          try {
            data = rawBody.trim() ? JSON.parse(rawBody) : {};
          } catch {
            data = {
              error: rawBody.trim().slice(0, 500) || i18n.t('appAlerts.broadcast.invalidServerResponse'),
            };
          }
          const errStr =
            typeof data.error === 'string'
              ? data.error.trim()
              : typeof data.message === 'string'
                ? String(data.message).trim()
                : '';
          const codeNorm = String(data.code ?? '')
            .trim()
            .toUpperCase();
          const isClaimLost =
            res.status === 409 &&
            (codeNorm === 'CLAIM_LOST' ||
              /não está mais disponível|outro.+(técnico|prestador).+já aceitou|claim_lost/i.test(errStr));
          if (!res.ok) {
            if (isClaimLost) {
              Alert.alert(getBroadcastOsUnavailableTitle(), getBroadcastOsUnavailableSubtitle());
            } else {
              const detail =
                errStr ||
                rawBody.trim().slice(0, 400) ||
                i18n.t('appAlerts.push.acceptFailedDetail', { status: String(res.status) });
              const codePart = codeNorm ? ` · ${codeNorm}` : '';
              Alert.alert(
                i18n.t('appAlerts.home.cannotAcceptTitle'),
                i18n.t('appAlerts.home.serverRefusedBody', {
                  detail: detail.replace(/\btécnico\b/gi, 'prestador'),
                  status: String(res.status),
                  codePart,
                }),
              );
            }
            if (user?.email) await pullTasks(user.email);
            refreshOffersIfEligible();
            return;
          }
          await appendUniqueStringToStoredArray('@brspark_accepted_tasks', taskIdStr);
          if (user?.email) await pullTasks(user.email);
          refreshOffersIfEligible();
        } catch (e: any) {
          Alert.alert(i18n.t('common.error'), e?.message || i18n.t('appAlerts.home.networkFail'));
          return;
        }

        Alert.alert(i18n.t('appAlerts.home.osAcceptedTitle'), i18n.t('appAlerts.home.osAcceptedBody'), [
          { text: i18n.t('appAlerts.home.osAcceptedNotNow'), style: 'cancel' },
          {
            text: i18n.t('appAlerts.home.osAcceptedStartNow'),
            style: 'default',
            onPress: async () => {
              await appendUniqueStringToStoredArray('@brspark_inprogress_tasks', String(selectedTask.id));
              await enqueueExecutionInProgressFromDashboard(String(selectedTask.id));
              router.push({
                pathname: '/checklist/[id]',
                params: { id: selectedTask.refId, taskId: selectedTask.id },
              } as any);
            },
          },
        ]);
      },
      onReject: async (selectedTask: any) => {
        const idStr = String(selectedTask?.id || '').trim();
        if (!idStr) {
          Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.broadcast.invalidOs'));
          return;
        }
        const reason = i18n.t('appAlerts.broadcast.rejectReasonFromOfferSheet');
        try {
          /** Path curto + taskId no body — evita 404 «Route not found» em alguns deploys Express. */
          const res = await apiFetch('/api/checklists/reject-broadcast-invite', {
            method: 'POST',
            body: JSON.stringify({ taskId: idStr, reason }),
          });
          const rawBody = await res.text();
          let errStr = '';
          try {
            const data = rawBody.trim() ? JSON.parse(rawBody) : {};
            errStr =
              typeof data.error === 'string'
                ? data.error.trim()
                : typeof data.message === 'string'
                  ? String(data.message).trim()
                  : '';
          } catch {
            errStr = rawBody.trim().slice(0, 400);
          }
          if (!res.ok) {
            Alert.alert(
              i18n.t('appAlerts.broadcast.cannotDeclineTitle'),
              i18n.t('appAlerts.broadcast.cannotDeclineBody', {
                detail: errStr || i18n.t('appAlerts.push.acceptFailedDetail', { status: String(res.status) }),
              }),
            );
            return;
          }

          setBroadcastOfferTasks((prev) => prev.filter((x) => String(x.id) !== idStr));
          try {
            await patchCloudTaskById(idStr, (row) => ({
              ...row,
              status: 'REJECTED',
              broadcastClaimPending: false,
              metadata: {
                ...(row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
                  ? row.metadata
                  : {}),
                rejectionReason: reason,
                rejectedAt: new Date().toISOString(),
              },
            }));
          } catch {
            /* ignore */
          }

          const rStr = await AsyncStorage.getItem('@brspark_rejected_tasks') || '[]';
          let rejArr: string[] = [];
          try {
            rejArr = JSON.parse(rStr);
          } catch {
            rejArr = [];
          }
          if (!Array.isArray(rejArr)) rejArr = [];
          if (!rejArr.includes(idStr)) {
            rejArr.push(idStr);
            await AsyncStorage.setItem('@brspark_rejected_tasks', JSON.stringify(rejArr));
          }
          if (user?.email) await pullTasks(user.email);
          applyBroadcastOffersImmediate();
          Alert.alert(i18n.t('appAlerts.home.rejectTitle'), i18n.t('appAlerts.broadcast.declinedBody'));
        } catch (e: any) {
          Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.broadcast.declineError') + (e?.message || String(e)));
        }
      },
    });
    return () => registerBroadcastOfferHandlers(null);
  }, [
    registerBroadcastOfferHandlers,
    isOnline,
    router,
    user?.email,
    refreshOffersIfEligible,
    applyBroadcastOffersImmediate,
    setBroadcastOfferTasks,
  ]);

  return null;
}
