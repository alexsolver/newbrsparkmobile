import React, { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeContext';
import {
  CLIENT_PUSH_ACTION_TRACK,
  TECH_PUSH_ACTION_ACCEPT,
  TECH_PUSH_ACTION_OPEN,
  TECH_PUSH_ACTION_REJECT,
} from '../constants/pushNotifications';
import { setPendingOpenExecutionFromPush } from '../lib/pushExecutionOpenIntent';
import { apiFetch } from '../services/auth';
import { enqueueExecutionStatusPatch } from '../services/syncService';
import {
  startTechTaskLiveActivity,
  stopTechTaskLiveActivityForTask,
} from '../services/techTaskLiveActivity';

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
  router: ReturnType<typeof useRouter>,
  branding: {
    appDisplayName?: string;
    primaryColor?: string;
    accentColor?: string;
    secondaryColor?: string;
    surfaceColor?: string;
  } | null
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

  /** Cliente escreveu no chat do link de rastreio — abrir a OS no app. */
  if (type === 'tracking_client_chat') {
    if (!isDefault) return;
    const taskId = String(data.taskId || data.executionId || '').trim();
    if (!taskId) return;
    setPendingOpenExecutionFromPush(taskId);
    router.replace('/(tabs)' as never);
    return;
  }

  /** Gestor escreveu no chat operacional da FT — mesmo ecrã do chat corporativo. */
  if (type === 'execution_ops_chat') {
    if (!isDefault) return;
    const taskId = String(data.taskId || '').trim();
    if (!taskId) return;
    router.push({
      pathname: '/chat/[id]',
      params: { id: taskId, ops: '1', name: 'Gestor · FT', color: '#1d4ed8' },
    } as never);
    return;
  }

  /** Despacho novo ou OS reaberta para revisão — mesmas ações (Aceitar / Recusar / OK). */
  if (type !== 'os_dispatched' && type !== 'os_reopened_revision') return;

  const taskId = String(data.taskId || '').trim();
  if (!taskId) return;

  const content = response.notification.request.content;
  const liveTitle = String(content.title || 'BrSpark').slice(0, 56);
  const liveSub = [content.subtitle, content.body]
    .filter((x) => typeof x === 'string' && String(x).trim())
    .map((x) => String(x).trim())
    .join(' — ')
    .slice(0, 120);

  if (action === TECH_PUSH_ACTION_ACCEPT) {
    await stopTechTaskLiveActivityForTask(taskId);
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
    await stopTechTaskLiveActivityForTask(taskId);
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
    await startTechTaskLiveActivity({
      taskId,
      title: liveTitle,
      subtitle: liveSub || undefined,
      appDisplayName: String(data.appDisplayName || branding?.appDisplayName || 'BrSpark'),
      liveActivityBadgeKey: String(data.liveActivityBadgeKey || 'brspark-badge'),
      primaryColor: branding?.primaryColor,
      accentColor: branding?.accentColor,
      secondaryColor: branding?.secondaryColor,
      surfaceColor: branding?.surfaceColor,
    });
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
  const { branding, appDisplayName } = useTheme();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response, router, {
        appDisplayName,
        primaryColor: branding?.primaryColor,
        accentColor: branding?.accentColor,
        secondaryColor: branding?.secondaryColor,
        surfaceColor: branding?.surfaceColor,
      });
    });
    return () => sub.remove();
  }, [router, branding, appDisplayName]);

  /** Com o app em primeiro plano, mostra Live Activity ao chegar OS/revisão (cartão no Lock Screen ao bloquear de novo). */
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const raw = notification.request.content.data;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const d = raw as Record<string, unknown>;
      const t = String(d.type || '');
      if (t !== 'os_dispatched' && t !== 'os_reopened_revision') return;
      const taskId = String(d.taskId || '').trim();
      if (!taskId) return;
      const c = notification.request.content;
      void startTechTaskLiveActivity({
        taskId,
        title: String(c.title || 'BrSpark').slice(0, 56),
        subtitle: [c.subtitle, c.body]
          .filter((x) => typeof x === 'string' && String(x).trim())
          .map((x) => String(x).trim())
          .join(' — ')
          .slice(0, 120),
        appDisplayName: String(d.appDisplayName || appDisplayName || 'BrSpark'),
        liveActivityBadgeKey: String(d.liveActivityBadgeKey || 'brspark-badge'),
        primaryColor: branding?.primaryColor,
        accentColor: branding?.accentColor,
        secondaryColor: branding?.secondaryColor,
        surfaceColor: branding?.surfaceColor,
      });
    });
    return () => sub.remove();
  }, [branding, appDisplayName]);

  useEffect(() => {
    if (handledColdStartRef.current) return;
    handledColdStartRef.current = true;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const last = await Notifications.getLastNotificationResponseAsync();
          if (last) {
            await handleNotificationResponse(last, router, {
              appDisplayName,
              primaryColor: branding?.primaryColor,
              accentColor: branding?.accentColor,
              secondaryColor: branding?.secondaryColor,
              surfaceColor: branding?.surfaceColor,
            });
          }
        } catch {
          /* ignore */
        }
      })();
    }, 700);
    return () => clearTimeout(t);
  }, [router, branding, appDisplayName]);

  return null;
}
