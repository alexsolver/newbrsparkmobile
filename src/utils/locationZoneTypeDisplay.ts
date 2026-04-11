import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { ColorPalette } from '../theme/colors';

export type LocationZoneIonicon = ComponentProps<typeof Ionicons>['name'];

/** Fundo, borda e cor do ícone — alinhado ao tema (chips / status do app). */
export type LocationZoneChrome = {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
};

function normalizeZone(zoneType: string | null | undefined): string {
  return String(zoneType || 'none')
    .trim()
    .toLowerCase();
}

function polygonChrome(isDark: boolean): LocationZoneChrome {
  if (isDark) {
    return {
      backgroundColor: 'rgba(139, 92, 246, 0.22)',
      borderColor: 'rgba(167, 139, 250, 0.42)',
      iconColor: '#DDD6FE',
    };
  }
  return {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    iconColor: '#5B21B6',
  };
}

/**
 * Cromática por tipo de local — usa tokens `status` e cartão para integrar com o restante da UI.
 */
export function resolveLocationZoneChrome(
  zoneType: string | null | undefined,
  colors: ColorPalette,
  isDark: boolean,
): LocationZoneChrome {
  const z = normalizeZone(zoneType);
  switch (z) {
    case 'radius':
    case 'point':
      return {
        backgroundColor: colors.status.info.bg,
        borderColor: colors.status.info.border,
        iconColor: colors.status.info.fg,
      };
    case 'segment':
      return {
        backgroundColor: colors.status.success.bg,
        borderColor: colors.status.success.border,
        iconColor: colors.status.success.fg,
      };
    case 'route':
      return {
        backgroundColor: colors.status.warning.bg,
        borderColor: colors.status.warning.border,
        iconColor: colors.status.warning.fg,
      };
    case 'polygon':
      return polygonChrome(isDark);
    case 'none':
    case '':
    default:
      return {
        backgroundColor: colors.surfaceLow,
        borderColor: colors.border,
        iconColor: colors.textSecondary,
      };
  }
}

/**
 * Tipos de local de atendimento (API / checklist execution).
 * `radius` = ponto com raio; `segment` = trecho A–B; `route` = rota; `polygon` = polígono; `none` = livre.
 */
export function getLocationZoneTypeVisual(zoneType: string | null | undefined): {
  icon: LocationZoneIonicon;
  label: string;
} {
  const z = normalizeZone(zoneType);

  switch (z) {
    case 'radius':
    case 'point':
      return { icon: 'location-outline', label: 'Tipo de local: ponto' };
    case 'segment':
      return { icon: 'swap-horizontal-outline', label: 'Tipo de local: trecho' };
    case 'route':
      return { icon: 'map-outline', label: 'Tipo de local: rota' };
    case 'polygon':
      return { icon: 'shapes-outline', label: 'Tipo de local: polígono' };
    case 'none':
    case '':
    default:
      return { icon: 'infinite-outline', label: 'Tipo de local: livre' };
  }
}
