import { API_BASE } from './auth';

/** Rótulos i18n legados (nomes curtos) quando o `id` não vem do CMS. */
export const LEGACY_SERVICE_CATEGORY_I18N: Record<string, string> = {
  Elétrica: 'electrical',
  Hidráulica: 'plumbing',
  Limpeza: 'cleaning',
  Reformas: 'renovation',
  Jardinagem: 'garden',
  Segurança: 'security',
  Climatização: 'climatization',
  Tecnologia: 'technology',
  Dedetização: 'pestControl',
  Mudança: 'moving',
  Gás: 'gas',
  Pintura: 'painting',
};

/** Chip de categoria alinhado ao filtro ?category= do diretório (nome canónico do CMS Web). */
export type DirectoryCategoryChip = {
  id: string;
  /** Se definido, usa `t(i18nKey)`; senão mostra `label` ou `id`. */
  i18nKey?: string;
  label?: string;
  icon: string;
  color?: string;
};

/** Fallback quando o BFF Node ou o CMS Laravel não estão disponíveis (lista antiga do app). */
export const FALLBACK_DIRECTORY_CATEGORY_CHIPS: DirectoryCategoryChip[] = [
  { id: '', i18nKey: 'common.all', icon: 'grid-outline' },
  { id: 'Elétrica', i18nKey: 'home.serviceCategories.electrical', icon: 'flash-outline' },
  { id: 'Hidráulica', i18nKey: 'home.serviceCategories.plumbing', icon: 'water-outline' },
  { id: 'Limpeza', i18nKey: 'home.serviceCategories.cleaning', icon: 'sparkles-outline' },
  { id: 'Reformas', i18nKey: 'home.serviceCategories.renovation', icon: 'hammer-outline' },
  { id: 'Jardinagem', i18nKey: 'home.serviceCategories.garden', icon: 'leaf-outline' },
  { id: 'Segurança', i18nKey: 'home.serviceCategories.security', icon: 'shield-checkmark-outline' },
  { id: 'Climatização', i18nKey: 'home.serviceCategories.climatization', icon: 'thermometer-outline' },
  { id: 'Tecnologia', i18nKey: 'home.serviceCategories.technology', icon: 'laptop-outline' },
  { id: 'Dedetização', i18nKey: 'home.serviceCategories.pestControl', icon: 'bug-outline' },
  { id: 'Mudança', i18nKey: 'home.serviceCategories.moving', icon: 'cube-outline' },
  { id: 'Gás', i18nKey: 'home.serviceCategories.gas', icon: 'flame-outline' },
  { id: 'Pintura', i18nKey: 'home.serviceCategories.painting', icon: 'color-palette-outline' },
];

/**
 * Categorias do diretório via BFF Node (`/api/directory/categories` → Laravel).
 * O `id` de cada chip é o valor a enviar em `ProviderService.search({ category })`.
 */
export async function fetchDirectoryCategoryChips(): Promise<DirectoryCategoryChip[]> {
  try {
    const res = await fetch(`${API_BASE}/api/directory/categories`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    const rows = Array.isArray(json.data) ? json.data : [];
    if (!rows.length) {
      return FALLBACK_DIRECTORY_CATEGORY_CHIPS;
    }
    const mapped: DirectoryCategoryChip[] = rows.map((row: any) => ({
      id: String(row.id || ''),
      label: row.label != null ? String(row.label) : String(row.id || ''),
      icon: String(row.icon || 'construct-outline'),
      color: row.color != null ? String(row.color) : undefined,
    }));
    return [{ id: '', i18nKey: 'common.all', icon: 'grid-outline' }, ...mapped];
  } catch {
    return FALLBACK_DIRECTORY_CATEGORY_CHIPS;
  }
}
