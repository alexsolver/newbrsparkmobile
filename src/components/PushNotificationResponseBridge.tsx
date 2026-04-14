import React, { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import {
  CLIENT_PUSH_ACTION_TRACK,
  TECH_PUSH_ACTION_ACCEPT,
  TECH_PUSH_ACTION_OPEN,
  TECH_PUSH_ACTION_REJECT,
} from '../constants/pushNotifications';
import { setPendingOpenExecutionFromPush } from '../lib/pushExecutionOpenIntent';
import { apiFetch } from '../services/auth';
import { enqueueExecutionStatusPatch } from '../services/syncService';

const REJECT_REASON_FROM_PUSH =
  'Recusada pelo alerta no dispositivo sem motivo adicional fornecido.';

function readData(
  response: Notifications.NotificationResponse
): Record<string, unknown> {
  const raw = response.notification.request.content.data;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  router: ReturnType<typeof useRouter>
): Promise<void> {
  const data = readData(response);
  const action = response.actionIdentifier;
  const isDefault = action === Notifications.DEFAULT_ACTION_IDENTIFIER;
  const type = String(data.type || '');

  if (type === 'client_provider_en_route') {
    if (!isDefault && action !== CLIENT_PUSH_ACTION_TRACK) return;
    const url = String(data.trackingUrl || '').trim();
    if (!url) {
      Alert.alert('Aviso', 'Link de acompanhamento indisponível.');
      return;
    }
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert('Erro', 'Não foi possível abrir o link de acompanhamento.');
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o link de acompanhamento.');
    }
    return;
  }

  if (type !== 'os_dispatched') return;

  const taskId = String(data.taskId || '').trim();
  if (!taskId) return;

  if (action === TECH_PUSH_ACTION_ACCEPT) {
    try {
      await enqueueExecutionStatusPatch(taskId, {
        status: 'ACCEPTED',
        timestamp: new Date().toISOString(),
      });
    } catch {
      Alert.alert('Erro', 'Não foi possível aceitar a atividade. Abra o app e tente de novo.');
    }
    return;
  }

  if (action === TECH_PUSH_ACTION_REJECT) {
    try {
      const res = await apiFetch(`/api/operations/tasks/${encodeURIComponent(taskId)}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: REJECT_REASON_FROM_PUSH }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        Alert.alert('Erro', (txt || `Falha HTTP ${res.status}`).slice(0, 240));
        return;
      }
      const rStr = await AsyncStorage.getItem('@brspark_rejected_tasks');
      let rejArr: string[] = [];
      try {
        rejArr = rStr ? JSON.parse(rStr) : [];
      } catch {
        rejArr = [];
      }
      if (!Array.isArray(rejArr)) rejArr = [];
      if (!rejArr.includes(taskId)) {
        rejArr.push(taskId);
        await AsyncStorage.setItem('@brspark_rejected_tasks', JSON.stringify(rejArr));
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível recusar a atividade. Abra o app e tente de novo.');
    }
    return;
  }

  if (action === TECH_PUSH_ACTION_OPEN || isDefault) {
    setPendingOpenExecutionFromPush(taskId);
    router.replace('/(tabs)' as never);
  }
}

/**
 * Trata toques em notificações push (ações e abertura padrão), incluindo cold start.
 */
export function PushNotificationResponseBridge() {
  const router = useRouter();
  const handledColdStartRef = useRef(false);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response, router);
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (handledColdStartRef.current) return;
    handledColdStartRef.current = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const last = await Notifications.getLastNotificationResponseAsync();
          if (last) {
            await handleNotificationResponse(last, router);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 700);
    return () => clearTimeout(t);
  }, [router]);

  return null;
}
