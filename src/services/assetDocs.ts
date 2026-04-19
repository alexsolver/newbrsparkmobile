import * as Notifications from 'expo-notifications';
import { AuthService } from './auth';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Assuming AsyncStorage is imported from somewhere

export interface AssetDocument {
  id: string;
  assetId: string;
  parentId?: string; // NOVO: Para criar estrutura hierárquica (Nulo = Raiz)
  title: string;
  category?: string; // Ex: Financeiro, Técnico, Vistoria
  version: number;   // v1, v2, v3...
  description?: string;
  expirationDate?: string; // ISO string 
  alertDaysBefore?: number; // 0, 1, 5, 10, 30
  uri: string;
  type: 'pdf' | 'image' | 'file' | 'folder';
  createdAt: string;
  history?: { 
    uri: string; 
    createdAt: string; 
    description?: string; 
    version: number;
  }[];
}

const KEY = (email: string) => AuthService.getUserKey('asset_docs', email);

async function loadAllSafe(ownerEmail?: string): Promise<AssetDocument[]> {
  if (!ownerEmail) return [];
  try {
    const data = await AsyncStorage.getItem(KEY(ownerEmail));
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? (parsed as AssetDocument[]) : [];
  } catch {
    return [];
  }
}

export const AssetDocService = {
  getDocuments: async (assetId: string, ownerEmail?: string): Promise<AssetDocument[]> => {
    const all = await loadAllSafe(ownerEmail);
    return all.filter(d => d.assetId === assetId);
  },

  getAllDocuments: async (ownerEmail?: string): Promise<AssetDocument[]> => {
     return loadAllSafe(ownerEmail);
  },

  saveDocument: async (doc: AssetDocument, ownerEmail: string) => {
    const all = await loadAllSafe(ownerEmail);
    const idx = all.findIndex(d => d.id === doc.id);
    
    if (idx >= 0) all[idx] = doc;
    else all.push(doc);
    
    await AsyncStorage.setItem(KEY(ownerEmail), JSON.stringify(all));

    // Agendar notificação se houver vencimento e alerta
    if (doc.expirationDate && doc.alertDaysBefore !== undefined) {
      await AssetDocService.scheduleNotification(doc);
    }
  },

  deleteDocument: async (id: string, ownerEmail: string) => {
    const all = await loadAllSafe(ownerEmail);
    const filtered = all.filter(d => d.id !== id);
    await AsyncStorage.setItem(KEY(ownerEmail), JSON.stringify(filtered));
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
