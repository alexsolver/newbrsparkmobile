import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export interface AssetDocument {
  id: string;
  assetId: string;
  title: string;
  category?: string; // Ex: Financeiro, Técnico, Vistoria
  version: number;   // v1, v2, v3...
  description?: string;
  expirationDate?: string; // ISO string 
  alertDaysBefore?: number; // 0, 1, 5, 10, 30
  uri: string;
  type: 'pdf' | 'image' | 'file';
  createdAt: string;
  history?: { 
    uri: string; 
    createdAt: string; 
    description?: string; 
    version: number;
  }[];
}

const STORAGE_KEY = 'brspark_asset_docs';

export const AssetDocService = {
  getDocuments: async (assetId: string): Promise<AssetDocument[]> => {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const all: AssetDocument[] = JSON.parse(data);
    return all.filter(d => d.assetId === assetId);
  },

  getAllDocuments: async (): Promise<AssetDocument[]> => {
     const data = await AsyncStorage.getItem(STORAGE_KEY);
     return data ? JSON.parse(data) : [];
  },

  saveDocument: async (doc: AssetDocument) => {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    const all: AssetDocument[] = data ? JSON.parse(data) : [];
    const idx = all.findIndex(d => d.id === doc.id);
    
    if (idx >= 0) all[idx] = doc;
    else all.push(doc);
    
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));

    // Agendar notificação se houver vencimento e alerta
    if (doc.expirationDate && doc.alertDaysBefore !== undefined) {
      await AssetDocService.scheduleNotification(doc);
    }
  },

  deleteDocument: async (id: string) => {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    const all: AssetDocument[] = data ? JSON.parse(data) : [];
    const filtered = all.filter(d => d.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    await Notifications.cancelScheduledNotificationAsync(id);
  },

  scheduleNotification: async (doc: AssetDocument) => {
    // Cancela notificação anterior se existir
    await Notifications.cancelScheduledNotificationAsync(doc.id);

    if (!doc.expirationDate || doc.alertDaysBefore === undefined) return;

    const expireDate = new Date(doc.expirationDate);
    const alertDate = new Date(expireDate.getTime());
    alertDate.setDate(alertDate.getDate() - doc.alertDaysBefore);
    alertDate.setHours(9, 0, 0, 0); // Alerta às 9:00

    if (alertDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        identifier: doc.id,
        content: {
          title: `⚠️ Vencimento de Documento: ${doc.title}`,
          body: doc.alertDaysBefore === 0 
            ? `O documento "${doc.title}" vence hoje!` 
            : `O documento "${doc.title}" vence em ${doc.alertDaysBefore} dias.`,
          data: { docId: doc.id, assetId: doc.assetId },
        },
        trigger: {
          date: alertDate,
        } as any,
      });
    }
  }
};
