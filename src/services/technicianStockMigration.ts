import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getMobileWarehouseAssetIdsFromLocalDb,
  migrateLegacyMobileWarehouseStockRows,
} from '../database';

const MIGRATION_FLAG = '@aria_tech_stock_legacy_migrated_v2';

/**
 * Move stock do antigo “armazém móvel” (Asset virtual) para tech_stock_* e limpa cache.
 * Corre uma vez por instalação (flag AsyncStorage).
 */
export async function ensureTechnicianStockLegacyMigration(ownerEmail?: string): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(MIGRATION_FLAG);
    if (done === '1') return;

    const ids = new Set<string>();
    const cached = await AsyncStorage.getItem('@aria_mobile_warehouse_asset_id');
    if (cached && String(cached).trim()) ids.add(String(cached).trim());
    if (ownerEmail) {
      getMobileWarehouseAssetIdsFromLocalDb(ownerEmail).forEach((id) => ids.add(id));
    }

    migrateLegacyMobileWarehouseStockRows([...ids]);
    await AsyncStorage.removeItem('@aria_mobile_warehouse_asset_id');
    await AsyncStorage.setItem(MIGRATION_FLAG, '1');
  } catch (e) {
    console.warn('[technicianStockMigration]', e);
  }
}
