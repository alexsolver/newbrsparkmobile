import type { Asset } from '../types/asset';

/** Legado: metadata em Asset (sync antigo). Usado só para migração e filtro de listagens de bens. */
export function isMobileWarehouseAsset(asset: { details?: Asset['details'] } | null | undefined): boolean {
  const d = asset?.details as Record<string, unknown> | undefined;
  return !!(d && d.mobileWarehouse === true);
}
