/**
 * Sempre montado no layout raiz: sincroniza ofertas broadcast após `pullTasks` (cache local)
 * quando o dashboard não está montado (ex.: checklist / mapa de deslocamento) e mantém
 * os handlers de aceitar/recusar ativos — o registo no `index` desmontava com `(client)`.
 */
import React, { useEffect, useCallback } from 'react';
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
import { enqueueExecutionStatusPatch, pullTasks } from '../services/syncService';
import {
  BROADCAST_OS_UNAVAILABLE_SUBTITLE,
  BROADCAST_OS_UNAVAILABLE_TITLE,
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

async function applyBroadcastOffersFromCache(setBroadcastOfferTasks: (v: any[]) => void) {
  const all = await loadAllCloudTasksForExecutionLookup();
  setBroadcastOfferTasks(all.filter((t: any) => Boolean(t?.broadcastClaimPending)));
}

export function BroadcastOfferRootBridge() {
  const { userRole, user } = useAuth();
  const { mode } = useAppContext();
  const { isOnline } = useConnectivity();
  const router = useRouter();
  const { setBroadcastOfferTasks, registerBroadcastOfferHandlers } = useProviderBroadcastOffer();

  const refreshOffersIfEligible = useCallback(() => {
    if (String(userRole || '').toUpperCase() !== 'TECHNICIAN' || mode !== 'PROVIDER') {
      setBroadcastOfferTasks([]);
      return;
    }
    void applyBroadcastOffersFromCache(setBroadcastOfferTasks);
  }, [userRole, mode, setBroadcastOfferTasks]);

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
          Alert.alert('Erro', 'Formulário ausente na OS.');
          return;
        }
        if (isOnline === false) {
          Alert.alert(
            'Sem ligação',
            'Para aceitar esta OS em concorrência é necessário estar online. Verifique a rede e tente de novo.',
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
              error: rawBody.trim().slice(0, 500) || 'Resposta inválida do servidor.',
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
              Alert.alert(BROADCAST_OS_UNAVAILABLE_TITLE, BROADCAST_OS_UNAVAILABLE_SUBTITLE);
            } else {
              const detail =
                errStr || rawBody.trim().slice(0, 400) || `O servidor recusou o pedido (HTTP ${res.status}).`;
              Alert.alert(
                'Não foi possível aceitar',
                `${detail.replace(/\btécnico\b/gi, 'prestador')}\n\n` +
                  `(HTTP ${res.status}${codeNorm ? ` · ${codeNorm}` : ''})`,
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
          Alert.alert('Erro', e?.message || 'Falha de rede.');
          return;
        }

        Alert.alert('OS Aceita!', 'Excelente! Deseja iniciar a execução da atividade agora mesmo?', [
          { text: 'Agora Não', style: 'cancel' },
          {
            text: 'Sim, Iniciar Agora',
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
        try {
          await apiFetch(`/api/operations/tasks/${selectedTask.id}/reject`, {
            method: 'POST',
            body: JSON.stringify({
              reason: 'Recusada pelo prestador na tela de oferta (broadcast).',
            }),
          });
          const rStr = await AsyncStorage.getItem('@brspark_rejected_tasks') || '[]';
          let rejArr: string[] = [];
          try {
            rejArr = JSON.parse(rStr);
          } catch {
            rejArr = [];
          }
          if (!Array.isArray(rejArr)) rejArr = [];
          if (!rejArr.includes(String(selectedTask.id))) {
            rejArr.push(String(selectedTask.id));
            await AsyncStorage.setItem('@brspark_rejected_tasks', JSON.stringify(rejArr));
          }
          if (user?.email) await pullTasks(user.email);
          refreshOffersIfEligible();
          Alert.alert('Recusada', 'A atividade foi rejeitada e retirada da sua fila.');
        } catch (e: any) {
          Alert.alert('Erro', 'Falha ao rejeitar a atividade: ' + (e?.message || String(e)));
        }
      },
    });
    return () => registerBroadcastOfferHandlers(null);
  }, [registerBroadcastOfferHandlers, isOnline, router, user?.email, refreshOffersIfEligible]);

  return null;
}
