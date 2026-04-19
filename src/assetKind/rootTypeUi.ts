import type { RootAssetType } from './types';

export type AssetRootVisual = {
  icon: string;
  color: string;
  bg: string;
};

const DEFAULT: AssetRootVisual = { icon: 'cube-outline', color: '#565E61', bg: '#F3F4F5' };

/** Visual por classe raiz (lista, mapa, árvore). */
export const ASSET_ROOT_VISUAL: Record<string, AssetRootVisual> = {
  REAL_ESTATE: { icon: 'business-outline', color: '#FF8C00', bg: '#FFF8F1' },
  MOBILITY: { icon: 'car-outline', color: '#904D00', bg: '#FFF7ED' },
  TERRESTRIAL: { icon: 'car-outline', color: '#904D00', bg: '#FFF7ED' },
  MACHINERY: { icon: 'construct-outline', color: '#64748B', bg: '#F1F5F9' },
  AQUATIC: { icon: 'boat-outline', color: '#006B5C', bg: '#E0F2F1' },
  IT: { icon: 'hardware-chip-outline', color: '#4338CA', bg: '#EEF2FF' },
  COLLECTIONS: { icon: 'diamond-outline', color: '#A16207', bg: '#FFFBEB' },
  SPECIAL: { icon: 'star-outline', color: '#70797C', bg: '#F3F4F5' },
  OTHER: { icon: 'cube-outline', color: '#565E61', bg: '#F3F4F5' },
};

export function getAssetRootVisual(type: string | undefined | null): AssetRootVisual {
  if (!type) return DEFAULT;
  return ASSET_ROOT_VISUAL[type] || DEFAULT;
}

/** Ícone compacto (header, mapa) — sem bg. */
export function getAssetRootIconColor(type: string | undefined | null): { icon: string; color: string } {
  const v = getAssetRootVisual(type);
  return { icon: v.icon as string, color: v.color };
}

/** Filtro da home: MOBILITY inclui registros legados TERRESTRIAL. */
export function assetMatchesRootFilter(assetType: string, filterId: string): boolean {
  if (filterId === 'ALL' || filterId === 'GLOBAL') return true;
  if (assetType === filterId) return true;
  if (filterId === 'MOBILITY' && assetType === 'TERRESTRIAL') return true;
  return false;
}

export const HOME_ROOT_FILTER_IDS: RootAssetType[] = [
  'REAL_ESTATE',
  'MOBILITY',
  'MACHINERY',
  'AQUATIC',
  'IT',
  'COLLECTIONS',
  'SPECIAL',
  'OTHER',
];

/** Ordem do seletor ao editar a classe raiz (inclui legados). */
export const ASSET_ROOT_TYPE_IDS_FOR_EDIT: string[] = [
  'REAL_ESTATE',
  'MOBILITY',
  'MACHINERY',
  'AQUATIC',
  'IT',
  'COLLECTIONS',
  'SPECIAL',
  'TERRESTRIAL',
  'OTHER',
];
