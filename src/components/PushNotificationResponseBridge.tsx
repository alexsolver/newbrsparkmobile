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
import {
  getBroadcastOsUnavailableSubtitle,
  getBroadcastOsUnavailableTitle,
} from '../constants/broadcastOsMessages';
import { setPendingOpenExecutionFromPush } from '../lib/pushExecutionOpenIntent';
import { apiFetch } from '../services/auth';
import i18n from '../i18n';
import { enqueueExecutionStatusPatch, pullTasks } from '../services/syncService';
import { BRSPARK_PERSONA_STORAGE_KEY } from '../context/PersonaContext';
import { getPersonaHomeHref } from '../navigation/personaRouting';
import {
  startTechTaskLiveActivity,
  stopTechTaskLiveActivityForTask,
} from '../services/techTaskLiveActivity';
import { emitTrackingClientChatPing } from '../lib/trackingClientChatPing';
import { NotificationService } from '../services/notifications';

function getRejectReasonFromPush(): string {
  return i18n.t('appAlerts.push.rejectReasonFromDevice');
}

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
      Alert.alert(i18n.t('common.attention'), i18n.t('appAlerts.push.trackingUnavailable'));
      return;
    }
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.push.trackingOpenError'));
    } catch {
      Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.push.trackingOpenError'));
    }
    return;
  }

  /** Cliente escreveu no chat do link de rastreio — abrir a OS no app. */
  if (type === 'tracking_client_chat') {
    if (!isDefault) return;
    const taskId = String(data.taskId || data.executionId || '').trim();
    if (!taskId) return;
    setPendingOpenExecutionFromPush(taskId);
    try {
      const raw = await AsyncStorage.getItem(BRSPARK_PERSONA_STORAGE_KEY);
      const p = raw === 'provider' ? 'provider' : 'client';
      router.replace(getPersonaHomeHref(p) as never);
    } catch {
      router.replace(getPersonaHomeHref('client') as never);
    }
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

  /** Convite à pesquisa de satisfação (cliente) — abre o formulário web no browser. */
  if (type === 'EVALUATION_CLIENT_SURVEY_INVITE') {
    if (!isDefault) return;
    const url = String(data.surveyUrl || '').trim();
    if (!url) {
      Alert.alert(
        i18n.t('appAlerts.push.surveyMissingUrlTitle'),
        i18n.t('appAlerts.push.surveyMissingUrlBody'),
      );
      return;
    }
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert(
          i18n.t('appAlerts.push.surveyMissingUrlTitle'),
          i18n.t('appAlerts.push.surveyDevUrlBody'),
        );
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(i18n.t('appAlerts.push.ratingTitle'), i18n.t('appAlerts.push.ratingOpenError'));
    }
    return;
  }

  /** Convite de vínculo (organizações e parcerias) — regista na central de avisos e abre aceite / lista. */
  if (type === 'PROVIDER_AFFILIATION_INVITED') {
    if (!isDefault) return;
    const affiliationId = String(data.affiliationId || '').trim();
    const content = response.notification.request.content;
    if (affiliationId) {
      NotificationService.addNotification({
        title: String(content.title || i18n.t('notificationHub.affInviteTitle')),
        body: String(content.body || i18n.t('notificationHub.affInviteBodyShort')),
        category: 'info',
        personaScope: 'provider',
        providerAffiliationId: affiliationId,
        fixedId: `paff_invite_${affiliationId}`,
        suppressLocalBanner: true,
      });
    }
    const acceptUrl = String(data.acceptUrl || '').trim();
    if (acceptUrl) {
      try {
        const can = await Linking.canOpenURL(acceptUrl);
        if (can) {
          await Linking.openURL(acceptUrl);
          return;
        }
      } catch {
        /* cair para navegação in-app */
      }
    }
    router.push('/profile/affiliations' as never);
    return;
  }

  /** Leilão: outro prestador aceitou primeiro — atualiza lista local. */
  if (type === 'os_broadcast_taken') {
    if (!isDefault) return;
    Alert.alert(getBroadcastOsUnavailableTitle(), getBroadcastOsUnavailableSubtitle());
    void pullTasks().catch(() => {});
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
      const broadcastOffer = String(data.broadcastOffer || '') === '1';
      if (broadcastOffer) {
        const res = await apiFetch(
          `/api/checklists/executions/${encodeURIComponent(taskId)}/claim`,
          { method: 'POST', body: JSON.stringify({}) },
        );
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          let msg = txt.trim();
          let code = '';
          try {
            const j = JSON.parse(txt) as { error?: string; message?: string; code?: string };
            msg = String(j.error || j.message || txt).trim();
            code = String(j.code || '').trim();
          } catch {
            /* use txt */
          }
          const isLost =
            res.status === 409 &&
            (code.toUpperCase() === 'CLAIM_LOST' ||
              /não está mais disponível|já aceitou|outro (técnico|prestador)/i.test(msg));
          if (isLost) {
            Alert.alert(getBroadcastOsUnavailableTitle(), getBroadcastOsUnavailableSubtitle());
          } else {
            const text =
              (msg || i18n.t('appAlerts.push.acceptFailedDetail', { status: String(res.status) })) +
              (code ? `\n\n(${code})` : '');
            Alert.alert(i18n.t('appAlerts.push.acceptFailedTitle'), text.replace(/\btécnico\b/gi, 'prestador'));
          }
        } else {
          void pullTasks().catch(() => {});
        }
        return;
      }
      await enqueueExecutionStatusPatch(taskId, {
        status: 'ACCEPTED',
        timestamp: new Date().toISOString(),
      });
    } catch {
      Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.push.acceptActivityError'));
    }
    return;
  }

  if (action === TECH_PUSH_ACTION_REJECT) {
    await stopTechTaskLiveActivityForTask(taskId);
    try {
      const broadcastOffer = String(data.broadcastOffer || '') === '1';
      const res = broadcastOffer
        ? await apiFetch('/api/checklists/reject-broadcast-invite', {
            method: 'POST',
            body: JSON.stringify({ taskId, reason: getRejectReasonFromPush() }),
          })
        : await apiFetch(`/api/operations/tasks/${encodeURIComponent(taskId)}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: getRejectReasonFromPush() }),
          });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        Alert.alert(
          i18n.t('common.error'),
          (txt || i18n.t('appAlerts.push.httpErrorFallback', { status: String(res.status) })).slice(0, 240)
        );
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
      Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.push.declineActivityError'));
    }
    return;
  }

  if (action === TECH_PUSH_ACTION_OPEN || isDefault) {
    await startTechTaskLiveActivity({
      taskId,
      title: liveTitle,
      subtitle: liveSub || undefined,
    });
    setPendingOpenExecutionFromPush(taskId);
    try {
      const raw = await AsyncStorage.getItem(BRSPARK_PERSONA_STORAGE_KEY);
      const p = raw === 'provider' ? 'provider' : 'client';
      router.replace(getPersonaHomeHref(p) as never);
    } catch {
      router.replace(getPersonaHomeHref('provider') as never);
    }
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

  /** Com o app em primeiro plano, mostra Live Activity ao chegar OS/revisão (cartão no Lock Screen ao bloquear de novo). */
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const raw = notification.request.content.data;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const d = raw as Record<string, unknown>;
      const t = String(d.type || '');
      if (t === 'tracking_client_chat') {
        const taskId = String(d.taskId || d.executionId || '').trim();
        if (taskId) emitTrackingClientChatPing(taskId);
        return;
      }
      if (t === 'os_broadcast_taken') {
        void pullTasks().catch(() => {});
        return;
      }
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
      });
    });
    return () => sub.remove();
  }, []);

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
