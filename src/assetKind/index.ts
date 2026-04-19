import { ASSET_KINDS, INDUSTRY_CONTEXTS } from './catalog';
import type {
  AssetKindDef,
  IndustryContext,
  ModuleVisibility,
  ModuleVisibilityMode,
  RootAssetType,
  AssetModuleId,
} from './types';
import { normalizeRootTypeForCatalog } from './rootTypeNormalize';

export * from './types';
export { ASSET_KINDS, INDUSTRY_CONTEXTS } from './catalog';
export { normalizeRootTypeForCatalog } from './rootTypeNormalize';
export { getAssetFormBlock, type AssetFormBlock } from './rootTypeForm';
export {
  getAssetRootVisual,
  getAssetRootIconColor,
  assetMatchesRootFilter,
  HOME_ROOT_FILTER_IDS,
  ASSET_ROOT_TYPE_IDS_FOR_EDIT,
  ASSET_ROOT_VISUAL,
  type AssetRootVisual,
} from './rootTypeUi';

const ALWAYS_VISIBLE: AssetModuleId[] = ['info', 'hier'];

export function isModuleVisible(
  moduleId: string,
  visibility?: ModuleVisibility | null,
  mode?: ModuleVisibilityMode | null
): boolean {
  if (ALWAYS_VISIBLE.includes(moduleId as AssetModuleId)) return true;
  if (!visibility || Object.keys(visibility).length === 0) return true;
  if (mode === 'whitelist') {
    return visibility[moduleId as AssetModuleId] === true;
  }
  return visibility[moduleId as AssetModuleId] !== false;
}

export function getKindById(id: string | null | undefined): AssetKindDef | null {
  if (!id) return null;
  return ASSET_KINDS.find((k) => k.id === id) || null;
}

export function listKindsForJourney(root: RootAssetType, contextId: string): AssetKindDef[] {
  const r = normalizeRootTypeForCatalog(root);
  return ASSET_KINDS.filter(
    (k) => k.contextIds.includes(contextId) && k.compatibleRootTypes.includes(r)
  );
}

export function getContextsForRoot(root: RootAssetType): IndustryContext[] {
  const r = normalizeRootTypeForCatalog(root);
  const withKinds = new Set(
    ASSET_KINDS.filter((k) => k.compatibleRootTypes.includes(r)).flatMap((k) => k.contextIds)
  );
  return INDUSTRY_CONTEXTS.filter((c) => withKinds.has(c.id));
}

export function buildModuleVisibilityFromKind(kind: AssetKindDef | null | undefined): ModuleVisibility | undefined {
  if (!kind) return undefined;
  const m = kind.defaultModules;
  if (!m || Object.keys(m).length === 0) return undefined;
  return { ...m };
}

export function validateTemplate(
  kind: AssetKindDef | null,
  values: Record<string, string | number | boolean>
): string | null {
  if (!kind || !kind.fieldSchema.length) return null;
  for (const f of kind.fieldSchema) {
    if (!f.required) continue;
    const v = values[f.id];
    if (f.type === 'number') {
      const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
      if (v === undefined || v === null || v === '' || Number.isNaN(n)) {
        return f.id;
      }
    } else if (f.type === 'boolean') {
      if (v === undefined) return f.id;
    } else if (v === undefined || v === null || v === '' || (typeof v === 'string' && !v.trim())) {
      return f.id;
    }
  }
  return null;
}
