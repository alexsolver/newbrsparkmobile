import type { RootAssetType } from './types';

/** Alinha tipos legados ao catálogo de tipos específicos (jornada operacional). */
export function normalizeRootTypeForCatalog(type: RootAssetType | string): RootAssetType {
  if (type === 'TERRESTRIAL') return 'MOBILITY';
  return type as RootAssetType;
}
