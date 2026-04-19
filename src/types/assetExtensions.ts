/** Registros genéricos persistidos em AsyncStorage por assetId (ver assetExtensionsService). */

export type WarrantyContractRecord = {
  id: string;
  assetId: string;
  title: string;
  subtype: 'factory_warranty' | 'extended' | 'lease' | 'maintenance_contract' | 'other';
  startDate?: string;
  endDate?: string;
  provider?: string;
  notes?: string;
  createdAt: string;
};

/** Legado — migrado em assetExtensionsService para pastas + documentos. */
export type ComplianceRecord = {
  id: string;
  assetId: string;
  name: string;
  standard?: string;
  validUntil?: string;
  notes?: string;
  createdAt: string;
};

export type ComplianceFolder = {
  id: string;
  assetId: string;
  name: string;
  createdAt: string;
};

export type ComplianceDocument = {
  id: string;
  assetId: string;
  folderId: string;
  title: string;
  standard?: string;
  /** Data local YYYY-MM-DD */
  validUntil?: string;
  notes?: string;
  /** Cópia local (documentDirectory) */
  localUri?: string;
  mimeType?: string;
  /** Dias antes do vencimento para alerta local (0 = no dia) */
  alertDaysBefore?: number;
  createdAt: string;
};

export type ReadingRecord = {
  id: string;
  assetId: string;
  kind: 'energy' | 'water' | 'gas' | 'odometer' | 'fuel' | 'hours' | 'other';
  /** Quando `kind === 'other'`: nome da opção personalizada (ex.: «Pressão», «CO₂»). */
  customLabel?: string;
  value: string;
  unit?: string;
  date: string;
  notes?: string;
  createdAt: string;
};

export type ValuationRecord = {
  id: string;
  assetId: string;
  bookValue: string;
  method?: string;
  usefulLifeMonths?: string;
  revaluationDate?: string;
  notes?: string;
  createdAt: string;
};

export type ServiceHistoryRecord = {
  id: string;
  assetId: string;
  date: string;
  category: 'revision' | 'recall' | 'tires' | 'critical' | 'hours' | 'other';
  odometer?: string;
  hours?: string;
  description: string;
  createdAt: string;
};

export type ProvenanceRecord = {
  id: string;
  assetId: string;
  date: string;
  event: 'acquisition' | 'transfer' | 'loan' | 'exhibition' | 'other';
  party?: string;
  notes?: string;
  createdAt: string;
};

export type OccupancyRecord = {
  id: string;
  assetId: string;
  unit?: string;
  tenant?: string;
  accessNotes?: string;
  alarmCodeHint?: string;
  createdAt: string;
};

export type IntegrationRecord = {
  id: string;
  assetId: string;
  system: string;
  externalId: string;
  lastSync?: string;
  notes?: string;
  createdAt: string;
};
