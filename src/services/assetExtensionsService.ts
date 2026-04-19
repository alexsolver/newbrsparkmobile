import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { AuthService } from './auth';
import type {
  WarrantyContractRecord,
  ComplianceRecord,
  ComplianceFolder,
  ComplianceDocument,
  ReadingRecord,
  ValuationRecord,
  ServiceHistoryRecord,
  ProvenanceRecord,
  OccupancyRecord,
  IntegrationRecord,
} from '../types/assetExtensions';
import {
  cancelComplianceDocumentNotification,
  scheduleComplianceDocumentNotification,
} from './complianceExpiryNotifications';

const KEY = (email: string) => AuthService.getUserKey('asset_extensions_v1', email);

type Store = {
  warranties: WarrantyContractRecord[];
  /** Legado — esvaziado após migração */
  compliance?: ComplianceRecord[];
  complianceFolders: ComplianceFolder[];
  complianceDocuments: ComplianceDocument[];
  readings: ReadingRecord[];
  /** Nomes de tipos «Outro» já usados (sugestões ao registar nova leitura). */
  readingOtherPresets: string[];
  valuation: ValuationRecord[];
  serviceHistory: ServiceHistoryRecord[];
  provenance: ProvenanceRecord[];
  occupancy: OccupancyRecord[];
  integrations: IntegrationRecord[];
};

const emptyStore = (): Store => ({
  warranties: [],
  compliance: [],
  complianceFolders: [],
  complianceDocuments: [],
  readings: [],
  readingOtherPresets: [],
  valuation: [],
  serviceHistory: [],
  provenance: [],
  occupancy: [],
  integrations: [],
});

function migrateComplianceIfNeeded(s: Store): { store: Store; changed: boolean } {
  const complianceFolders = [...(s.complianceFolders || [])];
  const complianceDocuments = [...(s.complianceDocuments || [])];
  const legacy = s.compliance;
  let changed = false;

  if (legacy && legacy.length > 0) {
    const byAsset = new Map<string, ComplianceRecord[]>();
    for (const row of legacy) {
      const arr = byAsset.get(row.assetId) || [];
      arr.push(row);
      byAsset.set(row.assetId, arr);
    }
    for (const [assetId, rows] of byAsset) {
      let folder = complianceFolders.find((f) => f.assetId === assetId && f.name === 'Geral');
      if (!folder) {
        folder = { id: uid(), assetId, name: 'Geral', createdAt: new Date().toISOString() };
        complianceFolders.push(folder);
      }
      for (const row of rows) {
        if (complianceDocuments.some((d) => d.id === row.id)) continue;
        complianceDocuments.push({
          id: row.id,
          assetId,
          folderId: folder.id,
          title: row.name,
          standard: row.standard,
          validUntil: row.validUntil,
          notes: row.notes,
          alertDaysBefore: row.validUntil ? 30 : undefined,
          createdAt: row.createdAt,
        });
      }
    }
    changed = true;
  }

  return {
    store: {
      ...s,
      compliance: [],
      complianceFolders,
      complianceDocuments,
    },
    changed,
  };
}

async function load(email: string): Promise<Store> {
  if (!email) return emptyStore();
  const raw = await AsyncStorage.getItem(KEY(email));
  if (!raw) return emptyStore();
  try {
    const p = { ...emptyStore(), ...JSON.parse(raw) } as Store;
    if (!Array.isArray(p.readingOtherPresets)) p.readingOtherPresets = [];
    const { store, changed } = migrateComplianceIfNeeded(p);
    if (changed) {
      await save(store, email);
      for (const d of store.complianceDocuments) {
        void scheduleComplianceDocumentNotification(d);
      }
    }
    return store;
  } catch {
    return emptyStore();
  }
}

async function save(store: Store, email: string) {
  await AsyncStorage.setItem(KEY(email), JSON.stringify(store));
}

function uid() {
  return `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const AssetExtensionsService = {
  async getWarranties(assetId: string, email?: string): Promise<WarrantyContractRecord[]> {
    if (!email) return [];
    const s = await load(email);
    return s.warranties.filter((r) => r.assetId === assetId);
  },
  async saveWarranty(row: Omit<WarrantyContractRecord, 'id' | 'createdAt'> & { id?: string }, email: string) {
    const s = await load(email);
    const id = row.id || uid();
    const createdAt = new Date().toISOString();
    const full: WarrantyContractRecord = {
      ...row,
      id,
      createdAt: s.warranties.find((x) => x.id === id)?.createdAt || createdAt,
    };
    const i = s.warranties.findIndex((x) => x.id === id);
    if (i >= 0) s.warranties[i] = full;
    else s.warranties.push(full);
    await save(s, email);
  },
  async deleteWarranty(id: string, email: string) {
    const s = await load(email);
    s.warranties = s.warranties.filter((x) => x.id !== id);
    await save(s, email);
  },

  async getComplianceFolders(assetId: string, email?: string): Promise<ComplianceFolder[]> {
    if (!email) return [];
    const s = await load(email);
    return s.complianceFolders.filter((f) => f.assetId === assetId).sort((a, b) => a.name.localeCompare(b.name));
  },

  async saveComplianceFolder(
    row: Omit<ComplianceFolder, 'id' | 'createdAt'> & { id?: string },
    email: string
  ) {
    const s = await load(email);
    const id = row.id || uid();
    const full: ComplianceFolder = {
      ...row,
      id,
      createdAt: s.complianceFolders.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    const i = s.complianceFolders.findIndex((x) => x.id === id);
    if (i >= 0) s.complianceFolders[i] = full;
    else s.complianceFolders.push(full);
    await save(s, email);
  },

  async deleteComplianceFolder(folderId: string, email: string) {
    const s = await load(email);
    const docs = s.complianceDocuments.filter((d) => d.folderId === folderId);
    for (const d of docs) {
      await cancelComplianceDocumentNotification(d.id);
      if (d.localUri?.startsWith('file://')) {
        try {
          await FileSystem.deleteAsync(d.localUri, { idempotent: true });
        } catch {
          /* ok */
        }
      }
    }
    s.complianceDocuments = s.complianceDocuments.filter((d) => d.folderId !== folderId);
    s.complianceFolders = s.complianceFolders.filter((f) => f.id !== folderId);
    await save(s, email);
  },

  async getComplianceDocuments(assetId: string, folderId: string | undefined, email?: string): Promise<ComplianceDocument[]> {
    if (!email) return [];
    const s = await load(email);
    let list = s.complianceDocuments.filter((d) => d.assetId === assetId);
    if (folderId) list = list.filter((d) => d.folderId === folderId);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getAllComplianceDocuments(email?: string): Promise<ComplianceDocument[]> {
    if (!email) return [];
    const s = await load(email);
    return [...s.complianceDocuments];
  },

  async saveComplianceDocument(
    row: Omit<ComplianceDocument, 'id' | 'createdAt'> & { id?: string },
    email: string
  ) {
    const s = await load(email);
    const id = row.id || uid();
    const full: ComplianceDocument = {
      ...row,
      id,
      createdAt: s.complianceDocuments.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    const i = s.complianceDocuments.findIndex((x) => x.id === id);
    if (i >= 0) s.complianceDocuments[i] = full;
    else s.complianceDocuments.push(full);
    await save(s, email);
    await scheduleComplianceDocumentNotification(full);
  },

  async deleteComplianceDocument(id: string, email: string) {
    const s = await load(email);
    const prev = s.complianceDocuments.find((x) => x.id === id);
    await cancelComplianceDocumentNotification(id);
    if (prev?.localUri?.startsWith('file://')) {
      try {
        await FileSystem.deleteAsync(prev.localUri, { idempotent: true });
      } catch {
        /* ok */
      }
    }
    s.complianceDocuments = s.complianceDocuments.filter((x) => x.id !== id);
    await save(s, email);
  },

  /** Reagenda alertas locais para todos os documentos (ex.: após restauro ou sync). */
  async rescheduleAllComplianceNotifications(email: string) {
    const s = await load(email);
    for (const d of s.complianceDocuments) {
      await cancelComplianceDocumentNotification(d.id);
      await scheduleComplianceDocumentNotification(d);
    }
  },

  async getReadings(assetId: string, email?: string): Promise<ReadingRecord[]> {
    if (!email) return [];
    const s = await load(email);
    return s.readings.filter((r) => r.assetId === assetId);
  },

  async getReadingOtherPresets(email?: string): Promise<string[]> {
    if (!email) return [];
    const s = await load(email);
    return [...(s.readingOtherPresets || [])];
  },

  /** Guarda um nome de tipo «Outro» na lista de sugestões (sem criar leitura). */
  async addReadingOtherPreset(label: string, email: string) {
    const t = label.trim();
    if (!t) return;
    const s = await load(email);
    const lows = new Set(s.readingOtherPresets.map((x) => x.toLowerCase()));
    if (lows.has(t.toLowerCase())) return;
    s.readingOtherPresets = [...s.readingOtherPresets, t].sort((a, b) => a.localeCompare(b));
    await save(s, email);
  },

  async saveReading(row: Omit<ReadingRecord, 'id' | 'createdAt'> & { id?: string }, email: string) {
    const s = await load(email);
    const id = row.id || uid();
    const full: ReadingRecord = {
      ...row,
      id,
      createdAt: s.readings.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    if (full.kind !== 'other') {
      full.customLabel = undefined;
    } else {
      const lab = full.customLabel?.trim();
      if (lab) {
        const lows = new Set(s.readingOtherPresets.map((x) => x.toLowerCase()));
        if (!lows.has(lab.toLowerCase())) {
          s.readingOtherPresets = [...s.readingOtherPresets, lab].sort((a, b) => a.localeCompare(b));
        }
      }
    }
    const i = s.readings.findIndex((x) => x.id === id);
    if (i >= 0) s.readings[i] = full;
    else s.readings.push(full);
    await save(s, email);
  },
  async deleteReading(id: string, email: string) {
    const s = await load(email);
    s.readings = s.readings.filter((x) => x.id !== id);
    await save(s, email);
  },

  async getValuations(assetId: string, email?: string): Promise<ValuationRecord[]> {
    if (!email) return [];
    const s = await load(email);
    return s.valuation.filter((r) => r.assetId === assetId);
  },
  async saveValuation(row: Omit<ValuationRecord, 'id' | 'createdAt'> & { id?: string }, email: string) {
    const s = await load(email);
    const id = row.id || uid();
    const full: ValuationRecord = {
      ...row,
      id,
      createdAt: s.valuation.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    const i = s.valuation.findIndex((x) => x.id === id);
    if (i >= 0) s.valuation[i] = full;
    else s.valuation.push(full);
    await save(s, email);
  },
  async deleteValuation(id: string, email: string) {
    const s = await load(email);
    s.valuation = s.valuation.filter((x) => x.id !== id);
    await save(s, email);
  },

  async getServiceHistory(assetId: string, email?: string): Promise<ServiceHistoryRecord[]> {
    if (!email) return [];
    const s = await load(email);
    return s.serviceHistory.filter((r) => r.assetId === assetId);
  },
  async saveServiceHistory(row: Omit<ServiceHistoryRecord, 'id' | 'createdAt'> & { id?: string }, email: string) {
    const s = await load(email);
    const id = row.id || uid();
    const full: ServiceHistoryRecord = {
      ...row,
      id,
      createdAt: s.serviceHistory.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    const i = s.serviceHistory.findIndex((x) => x.id === id);
    if (i >= 0) s.serviceHistory[i] = full;
    else s.serviceHistory.push(full);
    await save(s, email);
  },
  async deleteServiceHistory(id: string, email: string) {
    const s = await load(email);
    s.serviceHistory = s.serviceHistory.filter((x) => x.id !== id);
    await save(s, email);
  },

  async getProvenance(assetId: string, email?: string): Promise<ProvenanceRecord[]> {
    if (!email) return [];
    const s = await load(email);
    return s.provenance.filter((r) => r.assetId === assetId);
  },
  async saveProvenance(row: Omit<ProvenanceRecord, 'id' | 'createdAt'> & { id?: string }, email: string) {
    const s = await load(email);
    const id = row.id || uid();
    const full: ProvenanceRecord = {
      ...row,
      id,
      createdAt: s.provenance.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    const i = s.provenance.findIndex((x) => x.id === id);
    if (i >= 0) s.provenance[i] = full;
    else s.provenance.push(full);
    await save(s, email);
  },
  async deleteProvenance(id: string, email: string) {
    const s = await load(email);
    s.provenance = s.provenance.filter((x) => x.id !== id);
    await save(s, email);
  },

  async getOccupancy(assetId: string, email?: string): Promise<OccupancyRecord[]> {
    if (!email) return [];
    const s = await load(email);
    return s.occupancy.filter((r) => r.assetId === assetId);
  },
  async saveOccupancy(row: Omit<OccupancyRecord, 'id' | 'createdAt'> & { id?: string }, email: string) {
    const s = await load(email);
    const id = row.id || uid();
    const full: OccupancyRecord = {
      ...row,
      id,
      createdAt: s.occupancy.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    const i = s.occupancy.findIndex((x) => x.id === id);
    if (i >= 0) s.occupancy[i] = full;
    else s.occupancy.push(full);
    await save(s, email);
  },
  async deleteOccupancy(id: string, email: string) {
    const s = await load(email);
    s.occupancy = s.occupancy.filter((x) => x.id !== id);
    await save(s, email);
  },

  async getIntegrations(assetId: string, email?: string): Promise<IntegrationRecord[]> {
    if (!email) return [];
    const s = await load(email);
    return s.integrations.filter((r) => r.assetId === assetId);
  },
  async saveIntegration(row: Omit<IntegrationRecord, 'id' | 'createdAt'> & { id?: string }, email: string) {
    const s = await load(email);
    const id = row.id || uid();
    const full: IntegrationRecord = {
      ...row,
      id,
      createdAt: s.integrations.find((x) => x.id === id)?.createdAt || new Date().toISOString(),
    };
    const i = s.integrations.findIndex((x) => x.id === id);
    if (i >= 0) s.integrations[i] = full;
    else s.integrations.push(full);
    await save(s, email);
  },
  async deleteIntegration(id: string, email: string) {
    const s = await load(email);
    s.integrations = s.integrations.filter((x) => x.id !== id);
    await save(s, email);
  },
};
