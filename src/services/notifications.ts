import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, LogBox } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';
import i18n from '../i18n';
import { ProviderAffiliationsApi } from './providerAffiliations';
import { getLocalAssets, getVenueStockItemsOnly, getLocalTechStockItems } from '../database';
import { AssetExtensionsService } from './assetExtensionsService';
import {
  ANDROID_CHANNEL_CLIENT,
  ANDROID_CHANNEL_TECH,
  ANDROID_CHANNEL_TRACKING_CLIENT_CHAT,
  CLIENT_PUSH_ACTION_TRACK,
  PUSH_CATEGORY_CLIENT_TRACKING,
  PUSH_CATEGORY_TECH_ACTIVITY,
  TECH_PUSH_ACTION_ACCEPT,
  TECH_PUSH_ACTION_OPEN,
  TECH_PUSH_ACTION_REJECT,
} from '../constants/pushNotifications';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

/** Canais Android usados pelos pushes remotos (idempotente). */
async function ensureAndroidPushChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('brspark-alerts', {
    name: 'BrSpark Alertas',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_TECH, {
    name: 'BrSpark, Atividades (prestador)',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2563EB',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_CLIENT, {
    name: 'BrSpark, Deslocamento (cliente)',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#059669',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_TRACKING_CLIENT_CHAT, {
    name: 'BrSpark · Mensagem no chat (deslocamento)',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#EF4444',
    sound: 'default',
    vibrationPattern: [0, 120],
  });
}

/**
 * Regista categorias (botões Aceitar/Recusar/…) e canais Android **antes** do login.
 * Sem isto, o iOS pode entregar o push só com título/corpo — sem ações na notificação.
 */
export async function preparePushNotificationInfrastructure(): Promise<void> {
  await ensureAndroidPushChannels();
  await registerInteractivePushCategories();
}

/** Categorias com botões (lock screen / gaveta). Idempotente. */
export async function registerInteractivePushCategories(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(
      PUSH_CATEGORY_TECH_ACTIVITY,
      [
        {
          identifier: TECH_PUSH_ACTION_ACCEPT,
          buttonTitle: 'Aceitar',
          options: { opensAppToForeground: true },
        },
        {
          identifier: TECH_PUSH_ACTION_REJECT,
          buttonTitle: 'Recusar',
          options: { opensAppToForeground: true, isDestructive: true },
        },
        {
          identifier: TECH_PUSH_ACTION_OPEN,
          buttonTitle: 'OK',
          options: { opensAppToForeground: true },
        },
      ],
      {
        showTitle: true,
        showSubtitle: true,
      }
    );
    await Notifications.setNotificationCategoryAsync(
      PUSH_CATEGORY_CLIENT_TRACKING,
      [
        {
          identifier: CLIENT_PUSH_ACTION_TRACK,
          buttonTitle: 'Acompanhar percurso',
          options: { opensAppToForeground: true },
        },
      ],
      { showTitle: true, showSubtitle: true }
    );
  } catch (e) {
    console.warn('[BrSpark] Falha ao registar categorias de notificação:', e);
  }
}

// ─── Configuração Global do Handler ────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const raw = notification.request.content.data;
    const d =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null;
    const type = d ? String(d.type || '') : '';
    /** Cliente escreveu no chat do link — só som no 1.º plano; o mapa mostra aura no ícone. */
    if (type === 'tracking_client_chat') {
      return {
        shouldShowAlert: false,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// ─── Tipos ─────────────────────────────────────────────────────────────────────
/** Concha CLIENTE vs PRESTADOR — listas de alertas independentes (não misturar). */
export type NotificationPersona = 'client' | 'provider';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: 'maintenance' | 'expiry' | 'sync' | 'alert' | 'info' | 'evaluation';
  read: boolean;
  timestamp: number;
  /** Qual módulo de alertas exibe este item (cliente ≠ prestador). */
  personaScope: NotificationPersona;
  assetId?: string;
  assetTitle?: string;
  /** Navegação para detalhe em Desempenho */
  evaluationInstanceId?: string;
  /** Convite à pesquisa (cliente): abrir no browser em vez de Desempenho */
  surveyUrl?: string;
  /** Convite de vínculo empresa (prestador) — abre Organizações e parcerias */
  providerAffiliationId?: string;
}

const READ_NOTIFICATIONS_LEGACY_KEY = '@brspark_read_notifications';
const READ_NOTIFICATIONS_V2_KEY = '@brspark_read_notifications_v2';

// ─── Storage local em memória (vazio por padrão) ───────────────────────
let _notifications: AppNotification[] = [];

let _listeners: Array<() => void> = [];

// ─── API Pública do Serviço ────────────────────────────────────────────────────
export const NotificationService = {
  getAll(persona: NotificationPersona): AppNotification[] {
    return [..._notifications]
      .filter((n) => n.personaScope === persona)
      .sort((a, b) => b.timestamp - a.timestamp);
  },

  getUnreadCount(persona: NotificationPersona): number {
    return _notifications.filter((n) => n.personaScope === persona && !n.read).length;
  },

  async markAsRead(id: string, _persona: NotificationPersona) {
    _notifications = _notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    _listeners.forEach((l) => l());
    await NotificationService.saveReadStates();
  },

  async markAllAsRead(persona: NotificationPersona) {
    _notifications = _notifications.map((n) =>
      n.personaScope === persona ? { ...n, read: true } : n
    );
    _listeners.forEach((l) => l());
    await NotificationService.saveReadStates();
  },

  async saveReadStates() {
    try {
      const readIds = _notifications.filter((n) => n.read).map((n) => n.id);
      await AsyncStorage.setItem(READ_NOTIFICATIONS_V2_KEY, JSON.stringify(readIds));
    } catch (e) {}
  },

  async syncRealNotifications(userEmail: string) {
    let generated: AppNotification[] = [];

    // 1 + 2c + 2d em paralelo (antes: soma das latências de rede — abrir alertas parecia «travar»).
    const [shareSettled, evSettled, paffSettled] = await Promise.allSettled([
      (async () => {
        const res = await apiFetch('/api/shares/pending');
        if (!res.ok) return null;
        return res.json();
      })(),
      (async () => {
        const res = await apiFetch('/api/evaluations/me/instances');
        if (!res.ok) return null;
        return res.json();
      })(),
      ProviderAffiliationsApi.getMeStatus().catch(() => null),
    ]);

    if (shareSettled.status === 'fulfilled' && Array.isArray(shareSettled.value)) {
      shareSettled.value.forEach((p: any) => {
        generated.push({
          id: `share_${p.id}`,
          title: 'Convite de Compartilhamento',
          body: `${p.ownerEmail} quer compartilhar o ativo "${p.asset?.title || '—'}" com você.`,
          category: 'info',
          read: false,
          timestamp: new Date(p.createdAt || Date.now()).getTime(),
          personaScope: 'client',
          assetId: p.assetId,
        });
      });
    }

    // 2. Low Stock — bens (locais de ativo) — cliente
    const stockItems = getVenueStockItemsOnly(userEmail);
    stockItems.forEach((item) => {
      if (item.currentStock <= item.minStock) {
        generated.push({
          id: `stock_${item.id}`,
          title: `Estoque Crítico: ${item.name}`,
          body: `O item atingiu o nível mínimo (${item.currentStock} ${item.unit}). Reabasteça!`,
          category: 'alert',
          read: false,
          timestamp: Date.now() - 3600000,
          personaScope: 'client',
          assetId: item.locationId,
        });
      }
    });

    // 2b. Low Stock — estoque técnico — prestador
    const techItems = getLocalTechStockItems(userEmail);
    techItems.forEach((item) => {
      if (item.currentStock <= item.minStock) {
        generated.push({
          id: `tech_stock_${item.id}`,
          title: `Estoque técnico: ${item.name}`,
          body: `Saldo baixo (${item.currentStock} ${item.unit}). SKU ${item.sku}.`,
          category: 'alert',
          read: false,
          timestamp: Date.now() - 3500000,
          personaScope: 'provider',
        });
      }
    });

    if (evSettled.status === 'fulfilled' && evSettled.value && typeof evSettled.value === 'object') {
      const evJson = evSettled.value as { items?: unknown[] };
      const evItems: Array<{
        id: string;
        needsAck?: boolean;
        osNumber?: string | null;
        template?: { name?: string };
        createdAt?: string;
      }> = (Array.isArray(evJson.items) ? evJson.items : []) as any[];
      for (const it of evItems) {
        if (!it.needsAck) continue;
        const os = it.osNumber ? ` OS ${it.osNumber}` : '';
        const tpl = it.template?.name || 'Avaliação';
        generated.push({
          id: `eval_ack_${it.id}`,
          title: 'Avaliação crítica, confirme ciência',
          body: `${tpl}${os}: toque para abrir e confirmar que tomou conhecimento.`,
          category: 'evaluation',
          read: false,
          timestamp: new Date(it.createdAt || Date.now()).getTime(),
          personaScope: 'provider',
          evaluationInstanceId: it.id,
        });
      }
    }

    if (paffSettled.status === 'fulfilled' && paffSettled.value && typeof paffSettled.value === 'object') {
      const { affiliations } = paffSettled.value as { affiliations?: any[] };
      for (const row of affiliations || []) {
        if (String(row.status || '').toUpperCase() !== 'INVITED') continue;
        const tenantName = row.tenant?.name || '—';
        generated.push({
          id: `paff_invite_${row.id}`,
          title: i18n.t('notificationHub.affInviteTitle'),
          body: i18n.t('notificationHub.affInviteBody', { name: tenantName }),
          category: 'info',
          read: false,
          timestamp: row.invitedAt ? new Date(row.invitedAt).getTime() : Date.now(),
          personaScope: 'provider',
          providerAffiliationId: row.id,
        });
      }
    }

    // 3. Maintenance / Warning Assets — visão gestão do bem (cliente)
    const assets = getLocalAssets(userEmail, { includeMobileWarehouse: false });
    assets.forEach((asset) => {
      if (asset.statusType === 'warning') {
        generated.push({
          id: `asset_status_${asset.id}`,
          title: 'Aviso Preventivo de Ativo',
          body: `O ativo "${asset.title}" encontra-se com problema na inspeção (${asset.status}). Verifique.`,
          category: 'maintenance',
          read: false,
          timestamp: Date.now() - 7200000,
          personaScope: 'client',
          assetId: asset.id,
        });
      }
    });

    // 3b. Conformidade — cliente
    try {
      await AssetExtensionsService.rescheduleAllComplianceNotifications(userEmail);
      const compDocs = await AssetExtensionsService.getAllComplianceDocuments(userEmail);
      const nowMs = Date.now();
      const dayMs = 86400000;
      for (const d of compDocs) {
        if (!d.validUntil?.trim()) continue;
        const exp = new Date(d.validUntil.trim() + 'T12:00:00');
        if (Number.isNaN(exp.getTime())) continue;
        const diffDays = Math.ceil((exp.getTime() - nowMs) / dayMs);
        if (diffDays > 30) continue;
        const title = diffDays < 0 ? 'Conformidade vencida' : 'Conformidade a vencer';
        const body =
          diffDays < 0
            ? `"${d.title}", vencimento ${d.validUntil}.`
            : `"${d.title}" vence em ${diffDays} dia(s) (${d.validUntil}).`;
        generated.push({
          id: `compliance_inapp_${d.id}`,
          title,
          body,
          category: 'expiry',
          read: false,
          timestamp: exp.getTime(),
          personaScope: 'client',
          assetId: d.assetId,
        });
      }
    } catch (e) {
      /* offline / storage */
    }

    // 4. Pending Chat Contacts — NOT added to alerts module
    // Chat notifications are handled exclusively via push + chat badge.
    // See NotificationService.sendChatPush() called from _layout.tsx.

    // 5. Unread Chat Messages — NOT added to alerts module
    // Same reason: only push + chat icon badge.

    let readStates: string[] = [];
    try {
      const v2 = await AsyncStorage.getItem(READ_NOTIFICATIONS_V2_KEY);
      if (v2) {
        readStates = JSON.parse(v2);
      } else {
        const legacy = await AsyncStorage.getItem(READ_NOTIFICATIONS_LEGACY_KEY);
        if (legacy) {
          readStates = JSON.parse(legacy);
          await AsyncStorage.setItem(READ_NOTIFICATIONS_V2_KEY, legacy).catch(() => {});
        }
      }
    } catch (e) {}
    if (Array.isArray(readStates)) {
      generated = generated.map((notif) =>
        readStates.includes(notif.id) ? { ...notif, read: true } : notif
      );
    }

    /** Não apagar: testes manuais (`n_*`) nem convites/evals registados a partir do push (sinc. API ainda vazia). */
    const manualPushes = _notifications.filter(
      (n) =>
        n.id.startsWith('n_') ||
        n.id.startsWith('paff_invite_') ||
        n.id.startsWith('eval_survey_') ||
        n.providerAffiliationId,
    );

    const all = [...generated, ...manualPushes].sort((a, b) => b.timestamp - a.timestamp);
    
    // Deduplicate logic just in case
    const uniqueIds = new Set();
    const finalNotifs: AppNotification[] = [];
    all.forEach(n => {
      if (!uniqueIds.has(n.id)) {
        uniqueIds.add(n.id);
        finalNotifs.push(n);
      }
    });

    _notifications = finalNotifs;
    _listeners.forEach(l => l());
  },

  addNotification(
    notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & {
      /** Evita duplicados do mesmo convite (ex.: pesquisa por instância). */
      fixedId?: string;
      /** Push remoto já mostrou o alerta — não dispara segundo banner local. */
      suppressLocalBanner?: boolean;
    },
  ) {
    const { fixedId, suppressLocalBanner, ...rest } = notification;
    const id = fixedId ?? `n_${Date.now()}`;
    const newNotif: AppNotification = {
      ...(rest as Omit<AppNotification, 'id' | 'timestamp' | 'read'>),
      id,
      timestamp: Date.now(),
      read: false,
    };
    _notifications = _notifications.filter(
      (n) => !(n.id === id && n.personaScope === newNotif.personaScope)
    );
    _notifications = [newNotif, ..._notifications];
    _listeners.forEach((l) => l());
    if (!suppressLocalBanner) {
      void NotificationService.scheduleLocalPush(newNotif.title, newNotif.body).catch(() => {});
    }
  },

  subscribe(listener: () => void) {
    _listeners.push(listener);
    return () => { _listeners = _listeners.filter(l => l !== listener); };
  },

  /**
   * Envia push local para mensagem de chat.
   * NÃO adiciona ao módulo de alertas — apenas dispara a notificação
   * e incrementa o badge do ícone de chat via o polling no _layout.
   */
  async sendChatPush(roomName: string, unreadCount: number) {
    const title = `💬 ${roomName}`;
    const body = unreadCount === 1
      ? 'Nova mensagem no chat.'
      : `${unreadCount} novas mensagens.`;
    await NotificationService.scheduleLocalPush(title, body);
  },

  // ─── Permissão e Token Push ─────────────────────────────────────────────────
  async registerForPushNotificationsAsync(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push apenas em dispositivos físicos.');
      return null;
    }

    // Expo Go no Android: push remoto não suportado (SDK 53+; continua em SDK 54)
    const isExpoGo = Constants.appOwnership === 'expo';
    if (Platform.OS === 'android' && isExpoGo) {
      console.log('[BrSpark] Push remoto não disponível no Expo Go Android (use dev/production build com EAS).');
      return null;
    }

    await preparePushNotificationInfrastructure();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permissão de push negada.');
      return null;
    }

    try {
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as any).easConfig?.projectId;
      if (!projectId || String(projectId).trim() === '') {
        console.warn(
          '[BrSpark] Push: falta extra.eas.projectId no manifest. Corra `npx eas init` na raiz do projeto (ou defina EAS_PROJECT_ID / EXPO_PUBLIC_EAS_PROJECT_ID no .env) e faça nova build iOS.'
        );
        return null;
      }
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      console.log('[BrSpark] Expo Push Token:', tokenData.data);
      try {
        const res = await apiFetch('/api/sync/push_token', {
          method: 'POST',
          body: JSON.stringify({ token: tokenData.data, device: Platform.OS }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          console.warn('[BrSpark] push_token HTTP', res.status, txt.slice(0, 200));
        } else {
          console.log('[BrSpark] push_token registrado no servidor (OK)');
        }
      } catch (err) {
        console.log('[BrSpark] Falha ao sincronizar token push no backend', err);
      }
      return tokenData.data;
    } catch (e: unknown) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? (e as { code?: string }).code : '';
      if (code === 'ERR_NOTIFICATIONS_NO_EXPERIENCE_ID') {
        console.warn(
          '[BrSpark] Push sem projectId EAS. `npx eas init` + credenciais iOS em `eas credentials` (chave APNs).'
        );
      } else {
        console.log('[BrSpark] Erro ao obter push token:', e);
      }
      return null;
    }
  },

  async scheduleLocalPush(title: string, body: string) {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: null, // Imediato
    });
  },
};
