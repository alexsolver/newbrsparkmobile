import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

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

// ─── Storage local em memória (poderia ser AsyncStorage) ───────────────────────
let _notifications: AppNotification[] = [
  {
    id: 'n1',
    title: 'Manutenção Preventiva Vencida',
    body: 'Trator CAT B20 está há 120 dias sem revisão. Emita uma O.S.',
    category: 'maintenance',
    read: false,
    timestamp: Date.now() - 1000 * 60 * 30,
    assetId: '1',
    assetTitle: 'Trator CAT B20',
  },
  {
    id: 'n2',
    title: 'Apólice de Seguro Próxima do Vencimento',
    body: 'Veículo Placa ABC-1234 tem seguro vencendo em 15 dias.',
    category: 'expiry',
    read: false,
    timestamp: Date.now() - 1000 * 60 * 60 * 2,
    assetTitle: 'Frota ABC-1234',
  },
  {
    id: 'n3',
    title: 'Sincronização Concluída',
    body: '12 ativos foram sincronizados com o servidor B2B corporativo.',
    category: 'sync',
    read: true,
    timestamp: Date.now() - 1000 * 60 * 60 * 5,
  },
  {
    id: 'n4',
    title: 'Novo Ativo Detectado na Rede',
    body: 'Sensor IoT registrou um equipamento sem ficha. Cadastre agora.',
    category: 'alert',
    read: false,
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'n5',
    title: 'Relatório Mensal Disponível',
    body: 'O relatório KPI de Março de 2026 está pronto para download.',
    category: 'info',
    read: true,
    timestamp: Date.now() - 1000 * 60 * 60 * 48,
  },
];

let _listeners: Array<() => void> = [];

// ─── API Pública do Serviço ────────────────────────────────────────────────────
export const NotificationService = {
  getAll(): AppNotification[] {
    return [..._notifications].sort((a, b) => b.timestamp - a.timestamp);
  },

  getUnreadCount(): number {
    return _notifications.filter(n => !n.read).length;
  },

  markAsRead(id: string) {
    _notifications = _notifications.map(n => n.id === id ? { ...n, read: true } : n);
    _listeners.forEach(l => l());
  },

  markAllAsRead() {
    _notifications = _notifications.map(n => ({ ...n, read: true }));
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

  // ─── Permissão e Token Push ─────────────────────────────────────────────────
  async registerForPushNotificationsAsync(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push apenas em dispositivos físicos.');
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
