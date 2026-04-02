import { useState, useCallback } from 'react';
import { ApiService } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SYNC_COOLDOWN = 60000; // 1 minuto
const LAST_SYNC_KEY = 'brspark_last_manual_sync';

export function useManualSync(onSuccess?: () => Promise<void> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const { user } = useAuth();

  const onRefresh = useCallback(async (forced = false) => {
    if (refreshing) return;

    try {
      const now = Date.now();
      const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
      const lastSync = lastSyncStr ? parseInt(lastSyncStr) : 0;

      if (!forced && now - lastSync < SYNC_COOLDOWN) {
        const remaining = Math.ceil((SYNC_COOLDOWN - (now - lastSync)) / 1000);
        console.log(`[SYNC] Aguarde ${remaining}s para sincronizar novamente.`);
        if (onSuccess) await onSuccess(); // Still refresh local data even if throttled
        return;
      }

      setRefreshing(true);
      const success = await ApiService.sync(user?.email || undefined);
      
      if (success) {
        await AsyncStorage.setItem(LAST_SYNC_KEY, now.toString());
        if (onSuccess) await onSuccess();
      } else {
        Alert.alert('Sincronização', 'Ocorreu um erro ao sincronizar. Verifique sua conexão.');
      }
    } catch (error) {
      console.error('[SYNC] Erro manual:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, user]);

  return { refreshing, onRefresh };
}
