import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type LocationZoneIonicon = ComponentProps<typeof Ionicons>['name'];

/**
 * Tipos de local de atendimento (API / checklist execution).
 * `radius` = ponto com raio; `segment` = trecho A–B; `route` = rota; `polygon` = polígono; `none` = livre.
 */
export function getLocationZoneTypeVisual(zoneType: string | null | undefined): {
  icon: LocationZoneIonicon;
  label: string;
} {
  const z = String(zoneType || 'none')
    .trim()
    .toLowerCase();

  switch (z) {
    case 'radius':
    case 'point':
      return { icon: 'location', label: 'Tipo de local: ponto' };
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
