import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, LogBox } from 'react-native';
import Constants from 'expo-constants';

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

// ─── Configuração Global do Handler ────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';
import { getLocalAssets, getLocalStockItems } from '../database';

// ─── Tipos ─────────────────────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  category: 'maintenance' | 'expiry' | 'sync' | 'alert' | 'info';
  read: boolean;
  timestamp: number;
  assetId?: string;
  assetTitle?: string;
}

// ─── Storage local em memória (vazio por padrão) ───────────────────────
let _notifications: AppNotification[] = [];

let _listeners: Array<() => void> = [];

// ─── API Pública do Serviço ────────────────────────────────────────────────────
export const NotificationService = {
  getAll(): AppNotification[] {
    return [..._notifications].sort((a, b) => b.timestamp - a.timestamp);
  },

  getUnreadCount(): number {
    return _notifications.filter(n => !n.read).length;
  },

  async markAsRead(id: string) {
    _notifications = _notifications.map(n => n.id === id ? { ...n, read: true } : n);
    _listeners.forEach(l => l());
    await NotificationService.saveReadStates();
  },

  async markAllAsRead() {
    _notifications = _notifications.map(n => ({ ...n, read: true }));
    _listeners.forEach(l => l());
    await NotificationService.saveReadStates();
  },

  async saveReadStates() {
    try {
      const readIds = _notifications.filter(n => n.read).map(n => n.id);
      await AsyncStorage.setItem('@brspark_read_notifications', JSON.stringify(readIds));
    } catch(e) {}
  },

  async syncRealNotifications(userEmail: string) {
    let generated: AppNotification[] = [];

    // 1. Pending Shares
    try {
      const res = await apiFetch('/api/shares/pending');
      if (res.ok) {
        const pending = await res.json();
        pending.forEach((p: any) => {
          generated.push({
            id: `share_${p.id}`,
            title: 'Convite de Compartilhamento',
            body: `${p.ownerEmail} quer compartilhar o bem "${p.asset?.title || 'Ativo'}" com você.`,
            category: 'info',
            read: false,
            timestamp: new Date(p.createdAt || Date.now()).getTime(),
            assetId: p.assetId
          });
        });
      }
    } catch(e) {}

    // 2. Low Stock Alerts
    const stockItems = getLocalStockItems(userEmail);
    stockItems.forEach(item => {
      if (item.currentStock <= item.minStock) {
        generated.push({
          id: `stock_${item.id}`,
          title: `Estoque Crítico: ${item.name}`,
          body: `O item atingiu o nível mínimo (${item.currentStock} ${item.unit}). Reabasteça!`,
          category: 'alert',
          read: false,
          timestamp: Date.now() - 3600000, 
          assetId: item.locationId
        });
      }
    });

    // 3. Maintenance / Warning Assets
    const assets = getLocalAssets(userEmail);
    assets.forEach(asset => {
      // Ignorar caso o status seja resolvido
      if (asset.statusType === 'warning') {
        generated.push({
          id: `asset_status_${asset.id}`,
          title: 'Aviso Preventivo de Ativo',
          body: `O ativo "${asset.title}" encontra-se com problema na inspeção (${asset.status}). Verifique.`,
          category: 'maintenance',
          read: false,
          timestamp: Date.now() - 7200000,
          assetId: asset.id
        });
      }
    });

    // 4. Pending Chat Contacts — NOT added to alerts module
    // Chat notifications are handled exclusively via push + chat badge.
    // See NotificationService.sendChatPush() called from _layout.tsx.

    // 5. Unread Chat Messages — NOT added to alerts module
    // Same reason: only push + chat icon badge.

    // Try to load read state from AsyncStorage
    try {
      const readStatesStr = await AsyncStorage.getItem('@brspark_read_notifications');
      if (readStatesStr) {
        const readStates: string[] = JSON.parse(readStatesStr);
        generated = generated.map(notif => readStates.includes(notif.id) ? { ...notif, read: true } : notif);
      }
    } catch(e) {}

    // Add dynamically created manual push configs if existed
    const manualPushes = _notifications.filter(n => n.id.startsWith('n_'));

    // Merge generated with any manual push, unique by ID
    const all = [...generated, ...manualPushes].sort((a,b) => b.timestamp - a.timestamp);
    
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

  addNotification(notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) {
    const newNotif: AppNotification = {
      ...notification,
      id: `n_${Date.now()}`,
      timestamp: Date.now(),
      read: false,
    };
    _notifications = [newNotif, ..._notifications];
    _listeners.forEach(l => l());
    // Dispara push local
    NotificationService.scheduleLocalPush(notification.title, notification.body);
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

    // Verificar se está rodando no Expo Go e Android (SDK 53 removeu suporte a Push no Expo Go Android)
    const isExpoGo = Constants.appOwnership === 'expo';
    if (Platform.OS === 'android' && isExpoGo) {
      console.log('[BrSpark] Push notifications nativas não suportadas no Expo Go Android SDK 53+.');
      return null;
    }

    // Android: criar canal
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('brspark-alerts', {
        name: 'BrSpark Alertas',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permissão de push negada.');
      return null;
    }

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      console.log('[BrSpark] Expo Push Token:', tokenData.data);
      return tokenData.data;
    } catch (e) {
      console.log('[BrSpark] Erro ao obter push token:', e);
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
