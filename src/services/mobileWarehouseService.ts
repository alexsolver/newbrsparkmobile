import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';

const STORAGE_KEY = '@brspark_mobile_warehouse_asset_id';

export async function getCachedMobileWarehouseAssetId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Garante o asset de armazém móvel no servidor e guarda o id localmente (offline após primeiro sucesso).
 */
export async function ensureMobileWarehouseAssetId(): Promise<{ assetId: string; fromCache: boolean } | null> {
  const cached = await getCachedMobileWarehouseAssetId();
  if (cached) return { assetId: cached, fromCache: true };

  const res = await apiFetch('/api/sync/mobile-warehouse');
  if (!res.ok) return null;

  const data = await res.json().catch(() => ({}));
  const assetId = data?.assetId != null ? String(data.assetId).trim() : '';
  if (!assetId) return null;

  await AsyncStorage.setItem(STORAGE_KEY, assetId);
  return { assetId, fromCache: false };
}
