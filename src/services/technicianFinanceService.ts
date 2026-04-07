import {
  deleteTechFinanceEntryLocal,
  getLocalTechFinanceEntries,
  getTechFinanceRowById,
  saveTechFinanceEntryLocal,
} from '../database';
import type { TechnicianFinanceEntry, TechnicianFinanceKind } from '../types/technicianFinance';

function rowToEntry(row: any): TechnicianFinanceEntry {
  return {
    id: row.id,
    kind: row.kind === 'revenue' ? 'revenue' : 'expense',
    amount: Number(row.amount) || 0,
    currency: row.currency || 'BRL',
    description: row.description || undefined,
    taskId: row.taskId ?? null,
    templateId: row.templateId ?? null,
    fieldId: row.fieldId ?? null,
    scopeSuffix: row.scopeSuffix ?? '',
    source: row.source === 'checklist' ? 'checklist' : 'manual',
    createdAt: row.createdAt || new Date().toISOString(),
  };
}

/** Livro-caixa do técnico: independente de bens e do módulo de custos de ativos. */
export const TechnicianFinanceService = {
  getEntries: async (ownerEmail?: string): Promise<TechnicianFinanceEntry[]> => {
    return getLocalTechFinanceEntries(ownerEmail).map(rowToEntry);
  },

  getEntryById: async (id: string): Promise<TechnicianFinanceEntry | null> => {
    const raw = getTechFinanceRowById(id);
    return raw ? rowToEntry(raw) : null;
  },

  saveEntry: async (entry: TechnicianFinanceEntry, ownerEmail?: string) => {
    saveTechFinanceEntryLocal(
      {
        ...entry,
        owner_email: ownerEmail || null,
      },
      ownerEmail
    );
  },

  deleteEntry: async (id: string) => {
    deleteTechFinanceEntryLocal(id);
  },

  createManual: async (
    partial: {
      kind: TechnicianFinanceKind;
      amount: number;
      description?: string;
      currency?: string;
    },
    ownerEmail?: string
  ): Promise<TechnicianFinanceEntry> => {
    const entry: TechnicianFinanceEntry = {
      id: `tech_fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      kind: partial.kind,
      amount: Math.max(0, Number(partial.amount) || 0),
      currency: partial.currency || 'BRL',
      description: partial.description,
      taskId: null,
      templateId: null,
      fieldId: null,
      scopeSuffix: '',
      source: 'manual',
      createdAt: new Date().toISOString(),
    };
    await TechnicianFinanceService.saveEntry(entry, ownerEmail);
    return entry;
  },
};
