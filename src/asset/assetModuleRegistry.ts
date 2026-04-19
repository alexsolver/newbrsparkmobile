import type { Asset } from '../types/asset';
import type { AssetKindDef, AssetModuleId, ModuleVisibility, ModuleVisibilityMode } from '../assetKind/types';
import { buildModuleVisibilityFromKind } from '../assetKind';
import { normalizeRootTypeForCatalog } from '../assetKind/rootTypeNormalize';

export const ALWAYS_ON_ASSET_MODULES: AssetModuleId[] = ['info', 'hier'];

/** Módulos que o usuário pode ligar/desligar (exceto info e hier). */
export const OPTIONAL_ASSET_MODULE_IDS = [
  'media',
  'docs',
  'insurance',
  'maint',
  'costs',
  'stock',
  'vault',
  'reports',
  'history',
  'notes',
  'warranties',
  'compliance',
  'readings',
  'valuation',
  'serviceHistory',
  'agenda',
] as const satisfies readonly AssetModuleId[];

export const NEW_EXTENSION_MODULE_IDS: AssetModuleId[] = [
  'warranties',
  'compliance',
  'readings',
  'valuation',
  'serviceHistory',
  'agenda',
];

/**
 * Chaves i18n por id de módulo (alinha a getModules em app/asset/[id].tsx).
 * ids `docs` / `maint` / `vault` não têm chave `modules.docs` etc. — usam files, maintenance, security.
 */
export const MODULE_I18N_BY_ID: Record<
  AssetModuleId,
  { titleKey: string; subtitleKey: string }
> = {
  info: { titleKey: 'modules.info', subtitleKey: 'modules.infoSub' },
  hier: { titleKey: 'modules.hier', subtitleKey: 'modules.hierSub' },
  media: { titleKey: 'modules.media', subtitleKey: 'modules.mediaSub' },
  docs: { titleKey: 'modules.files', subtitleKey: 'modules.filesSub' },
  insurance: { titleKey: 'modules.insurance', subtitleKey: 'modules.insuranceSub' },
  maint: { titleKey: 'modules.maintenance', subtitleKey: 'modules.maintenanceSub' },
  costs: { titleKey: 'modules.costs', subtitleKey: 'modules.costsSub' },
  stock: { titleKey: 'modules.stock', subtitleKey: 'modules.stockSub' },
  vault: { titleKey: 'modules.security', subtitleKey: 'modules.securitySub' },
  reports: { titleKey: 'modules.reports', subtitleKey: 'modules.reportsSub' },
  history: { titleKey: 'modules.history', subtitleKey: 'modules.historySub' },
  notes: { titleKey: 'modules.notes', subtitleKey: 'modules.notesSub' },
  warranties: { titleKey: 'modules.warranties', subtitleKey: 'modules.warrantiesSub' },
  compliance: { titleKey: 'modules.compliance', subtitleKey: 'modules.complianceSub' },
  readings: { titleKey: 'modules.readings', subtitleKey: 'modules.readingsSub' },
  valuation: { titleKey: 'modules.valuation', subtitleKey: 'modules.valuationSub' },
  serviceHistory: { titleKey: 'modules.serviceHistory', subtitleKey: 'modules.serviceHistorySub' },
  agenda: { titleKey: 'modules.agenda', subtitleKey: 'modules.agendaSub' },
};

function heuristicEnableNewModule(id: AssetModuleId, root: Asset['type']): boolean {
  const r = normalizeRootTypeForCatalog(root);
  const map: Partial<Record<Asset['type'], AssetModuleId[]>> = {
    REAL_ESTATE: ['readings', 'warranties'],
    MOBILITY: ['serviceHistory', 'readings', 'warranties'],
    MACHINERY: ['compliance', 'readings', 'serviceHistory', 'valuation'],
    AQUATIC: ['compliance', 'serviceHistory', 'warranties'],
    IT: ['valuation', 'warranties', 'compliance'],
    COLLECTIONS: ['valuation', 'warranties'],
    SPECIAL: [],
    OTHER: [],
  };
  return (map[r] || []).includes(id);
}

/** Pré-seleção no cadastro: respeita defaultModules do kind + heurísticas por raiz para módulos novos. */
export function buildDefaultModuleSelectionForNewAsset(
  rootType: Asset['type'],
  kind: AssetKindDef | null
): Record<AssetModuleId, boolean> {
  const vis = buildModuleVisibilityFromKind(kind) || {};
  const out = {} as Record<AssetModuleId, boolean>;
  for (const id of OPTIONAL_ASSET_MODULE_IDS) {
    if (vis[id] === false) out[id] = false;
    else if (vis[id] === true) out[id] = true;
    else if (NEW_EXTENSION_MODULE_IDS.includes(id)) out[id] = heuristicEnableNewModule(id, rootType);
    else out[id] = true;
  }
  return out;
}

export function moduleSelectionToWhitelist(map: Record<string, boolean>): ModuleVisibility {
  const m: ModuleVisibility = {};
  for (const id of OPTIONAL_ASSET_MODULE_IDS) {
    m[id] = map[id] === true;
  }
  return m;
}

export function expandVisibilityForEdit(asset: Asset): Record<AssetModuleId, boolean> {
  const mode = asset.details?.moduleVisibilityMode as ModuleVisibilityMode | undefined;
  const vis = (asset.details?.moduleVisibility || {}) as ModuleVisibility;
  const out = {} as Record<AssetModuleId, boolean>;
  for (const id of OPTIONAL_ASSET_MODULE_IDS) {
    if (mode === 'whitelist') out[id] = vis[id] === true;
    else out[id] = vis[id] !== false;
  }
  return out;
}
