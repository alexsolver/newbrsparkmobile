import type { Asset } from '../types/asset';

export type RootAssetType = Asset['type'];

export type FieldSchema = {
  id: string;
  labelKey: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  required?: boolean;
  placeholderKey?: string;
};

/** Ids alinhados a getModules() em app/asset/[id].tsx; info/hier forçados visíveis no app. */
export type AssetModuleId =
  | 'info'
  | 'media'
  | 'docs'
  | 'insurance'
  | 'maint'
  | 'costs'
  | 'stock'
  | 'hier'
  | 'vault'
  | 'reports'
  | 'history'
  | 'notes'
  | 'warranties'
  | 'compliance'
  | 'readings'
  | 'valuation'
  | 'serviceHistory'
  | 'agenda';

/** blacklist: só `false` oculta (legado). whitelist: só `true` exibe (cadastro novo / edição explícita). */
export type ModuleVisibilityMode = 'blacklist' | 'whitelist';

/** Só precisa listar módulos explicitamente desligados; omissão = visível (modo blacklist). */
export type ModuleVisibility = Partial<Record<AssetModuleId, boolean>>;

export type IndustryContext = {
  id: string;
  labelKey: string;
  descKey: string;
  icon: string;
  color: string;
};

export type AssetKindDef = {
  id: string;
  labelKey: string;
  /** i18n singular description for search and subtitle */
  shortDescKey: string;
  contextIds: string[];
  /** Raízes de ativo com as quais este tipo pode ser cadastrado */
  compatibleRootTypes: RootAssetType[];
  icon: string;
  color: string;
  /** Tokens em PT (minúsculo) para busca local sem depender de i18n */
  searchTokens: string;
  fieldSchema: FieldSchema[];
  defaultModules: ModuleVisibility;
  /** chave i18n opcional; usada no CTA pós-cadastro */
  maintenanceHintKey?: string;
  /** meses; se definido, mostra sugestão de manutenção periódica */
  maintenanceIntervalMonths?: number;
  /** Categoria alfanumérica pro marketplace (futuro) */
  marketplaceTag?: string;
};
