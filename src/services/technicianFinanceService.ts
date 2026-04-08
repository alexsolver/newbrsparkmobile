import {
  deleteTechFinanceEntryLocal,
  getLocalTechFinanceEntries,
  getTechFinanceRowById,
  saveTechFinanceEntryLocal,
} from '../database';
import {
  injectManualFinanceLineIntoTaskDraft,
  removeManualFinanceLineFromTaskDraft,
  splitCurrencyBrl,
} from './manualExpenseTaskDraftInject';
import {
  effectiveProviderTaskStatus,
  isPendingOrInAttendance,
  linkedTasksAllowFinanceEdit,
} from '../utils/technicianFinanceLinkableTasks';
import type {
  TechnicianFinanceAttachment,
  TechnicianFinanceEntry,
  TechnicianFinanceKind,
} from '../types/technicianFinance';

function parseAttachments(row: any): TechnicianFinanceAttachment[] | undefined {
  const raw = row.attachments_json ?? row.attachments;
  if (raw == null) return undefined;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(j) || j.length === 0) return undefined;
    const out: TechnicianFinanceAttachment[] = [];
    for (const x of j) {
      if (x && typeof x === 'object' && typeof (x as any).uri === 'string') {
        out.push({
          uri: String((x as any).uri),
          name: (x as any).name != null ? String((x as any).name) : undefined,
          mimeType: (x as any).mimeType != null ? String((x as any).mimeType) : undefined,
        });
      }
    }
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function parseLinkedTaskIds(row: any): string[] | undefined {
  const raw = row.linked_task_ids_json ?? row.linkedTaskIds;
  if (raw == null) return undefined;
  try {
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(j) || j.length === 0) return undefined;
    const ids = j.map((x: unknown) => String(x).trim()).filter(Boolean);
    return ids.length > 0 ? [...new Set(ids)] : undefined;
  } catch {
    return undefined;
  }
}

function linkedTaskIdsForEntry(item: TechnicianFinanceEntry): string[] {
  if (item.linkedTaskIds && item.linkedTaskIds.length > 0) {
    return [...new Set(item.linkedTaskIds.map((id) => String(id).trim()).filter(Boolean))];
  }
  if (item.taskId) return [String(item.taskId)];
  return [];
}

function rowToEntry(row: any): TechnicianFinanceEntry {
  return {
    id: row.id,
    kind: row.kind === 'revenue' ? 'revenue' : 'expense',
    amount: Number(row.amount) || 0,
    currency: row.currency || 'BRL',
    description: row.description || undefined,
    linkedTaskIds: parseLinkedTaskIds(row),
    taskId: row.taskId ?? null,
    templateId: row.templateId ?? null,
    fieldId: row.fieldId ?? null,
    scopeSuffix: row.scopeSuffix ?? '',
    source: row.source === 'checklist' ? 'checklist' : 'manual',
    createdAt: row.createdAt || new Date().toISOString(),
    attachments: parseAttachments(row),
  };
}

/** Para UI: editável sem async (mapa de OS + conjuntos do dashboard). */
export function isManualFinanceEntryEditableInMemory(
  entry: TechnicianFinanceEntry,
  cloudTasks: any[],
  sets: { completedIds: Set<string>; inprogressIds: Set<string>; acceptedIds: Set<string> }
): boolean {
  if (entry.source === 'checklist') return false;
  const tids = linkedTaskIdsForEntry(entry);
  if (tids.length === 0) return true;
  const multiOs = tids.length > 1;
  const map = new Map<string, any>();
  for (const t of cloudTasks) {
    if (t?.id != null) map.set(String(t.id), t);
  }
  for (const tid of tids) {
    const t = map.get(tid);
    if (!t) {
      if (multiOs) return false;
      if (sets.completedIds.has(tid)) return false;
      continue;
    }
    const eff = effectiveProviderTaskStatus(t, sets.completedIds, sets.inprogressIds, sets.acceptedIds);
    if (!isPendingOrInAttendance(eff)) return false;
  }
  return true;
}

/**
 * Despesa rateada (várias linhas e/ou várias OS): todas as OS do rateio têm de estar no cache local
 * e em pendentes ou em atendimento.
 */
export function isManualSplitRateioEditableInMemory(
  parts: TechnicianFinanceEntry[],
  cloudTasks: any[],
  sets: { completedIds: Set<string>; inprogressIds: Set<string>; acceptedIds: Set<string> }
): boolean {
  if (parts.length === 0) return false;
  if (parts.some((p) => p.source === 'checklist')) return false;

  const distinct = [
    ...new Set(
      parts
        .map((p) => (p.taskId ? String(p.taskId).trim() : ''))
        .filter(Boolean)
    ),
  ];
  const isRateio = parts.length > 1 || distinct.length > 1;

  if (!isRateio) {
    return isManualFinanceEntryEditableInMemory(parts[0], cloudTasks, sets);
  }

  if (parts.some((p) => !p.taskId)) return false;

  const map = new Map<string, any>();
  for (const t of cloudTasks) {
    if (t?.id != null) map.set(String(t.id), t);
  }

  for (const tid of distinct) {
    const t = map.get(tid);
    if (!t) return false;
    const eff = effectiveProviderTaskStatus(t, sets.completedIds, sets.inprogressIds, sets.acceptedIds);
    if (!isPendingOrInAttendance(eff)) return false;
  }
  return true;
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

  canEditManualEntry: async (
    entry: TechnicianFinanceEntry
  ): Promise<{ ok: boolean; reason?: string }> => {
    if (entry.source === 'checklist') {
      return { ok: false, reason: 'Altere este lançamento no formulário da OS.' };
    }
    const tids = linkedTaskIdsForEntry(entry);
    if (tids.length === 0) return { ok: true };
    const multiOs = tids.length > 1;
    const allowed = await linkedTasksAllowFinanceEdit(tids, {
      requireAllTasksOnDevice: multiOs,
    });
    if (!allowed) {
      return {
        ok: false,
        reason: multiOs
          ? 'No rateio, todas as OS têm de estar neste telemóvel (lista sincronizada), em pendentes ou em atendimento.'
          : 'Só é possível editar enquanto a OS estiver em pendentes ou em atendimento. Após conclusão, o registo fica bloqueado.',
      };
    }
    return { ok: true };
  },

  /**
   * Substitui um ou mais lançamentos manuais (ex.: rateio) pelos dados novos.
   * Remove linhas antigas dos rascunhos das OS e volta a criar com `createManual`.
   */
  updateManualTechnicianFinance: async (
    entryIds: string[],
    fields: {
      kind: TechnicianFinanceKind;
      amount: number;
      description?: string;
      currency?: string;
      attachments?: TechnicianFinanceAttachment[];
      /** OS ligadas (vazio = sem vínculo). */
      linkedTaskIds: string[];
    },
    ownerEmail?: string
  ): Promise<void> => {
    const ids = [...new Set(entryIds.map((x) => String(x).trim()).filter(Boolean))];
    if (ids.length === 0) throw new Error('Sem lançamento.');

    const entries: TechnicianFinanceEntry[] = [];
    for (const id of ids) {
      const raw = getTechFinanceRowById(id);
      if (!raw) throw new Error('Lançamento não encontrado.');
      entries.push(rowToEntry(raw));
    }

    if (entries.some((e) => e.source !== 'manual')) {
      throw new Error('Só lançamentos manuais podem ser editados aqui.');
    }

    const kind0 = entries[0].kind;
    if (entries.some((e) => e.kind !== kind0)) {
      throw new Error('Lançamentos incompatíveis.');
    }

    const oldTids = new Set<string>();
    for (const e of entries) {
      for (const t of linkedTaskIdsForEntry(e)) oldTids.add(t);
    }
    const newLinked =
      fields.kind === 'revenue'
        ? []
        : [...new Set(fields.linkedTaskIds.map((x) => String(x).trim()).filter(Boolean))];

    const oldMultiOs = oldTids.size > 1 || ids.length > 1;
    const newMultiOs = newLinked.length > 1;

    if (oldTids.size > 0) {
      const ok = await linkedTasksAllowFinanceEdit([...oldTids], {
        requireAllTasksOnDevice: oldMultiOs,
      });
      if (!ok) {
        throw new Error(
          oldMultiOs
            ? 'Para editar o rateio, sincronize o telemóvel: todas as OS envolvidas têm de estar na lista local, em pendentes ou em atendimento.'
            : 'Só é possível editar enquanto a OS estiver em pendentes ou em atendimento. Após conclusão, o registo fica bloqueado.'
        );
      }
    }
    if (newLinked.length > 0) {
      const ok2 = await linkedTasksAllowFinanceEdit(newLinked, {
        requireAllTasksOnDevice: newMultiOs,
      });
      if (!ok2) {
        throw new Error(
          newMultiOs
            ? 'No rateio, todas as OS escolhidas têm de estar no telemóvel, em pendentes ou em atendimento.'
            : 'Só pode relacionar a OS em pendentes ou em atendimento (incl. revisões em curso).'
        );
      }
    }

    for (const e of entries) {
      for (const tid of linkedTaskIdsForEntry(e)) {
        await removeManualFinanceLineFromTaskDraft(tid, e.id);
      }
      deleteTechFinanceEntryLocal(e.id);
    }

    const total = Math.max(0, Number(fields.amount) || 0);
    await TechnicianFinanceService.createManual(
      {
        kind: fields.kind,
        amount: total,
        description: fields.description,
        currency: fields.currency,
        attachments: fields.attachments,
        linkedTaskIds: newLinked.length > 0 ? newLinked : undefined,
      },
      ownerEmail
    );
  },

  createManual: async (
    partial: {
      kind: TechnicianFinanceKind;
      amount: number;
      description?: string;
      currency?: string;
      attachments?: TechnicianFinanceAttachment[];
      linkedTaskIds?: string[];
    },
    ownerEmail?: string
  ): Promise<TechnicianFinanceEntry> => {
    const total = Math.max(0, Number(partial.amount) || 0);
    const linked =
      partial.kind === 'expense' && partial.linkedTaskIds && partial.linkedTaskIds.length > 0
        ? [...new Set(partial.linkedTaskIds.map((id) => String(id).trim()).filter(Boolean))]
        : [];

    if (linked.length > 0) {
      const amounts = splitCurrencyBrl(total, linked.length);
      const baseDesc = partial.description?.trim() || '';
      const atts =
        partial.attachments && partial.attachments.length > 0 ? partial.attachments : undefined;
      let firstSaved: TechnicianFinanceEntry | null = null;
      const t0 = Date.now();
      for (let i = 0; i < linked.length; i++) {
        const taskId = linked[i];
        const entryId = `tech_fin_${t0}_${i}_${Math.random().toString(36).slice(2, 10)}`;
        const desc =
          linked.length > 1
            ? baseDesc
              ? `${baseDesc} (rateio ${i + 1}/${linked.length})`
              : `Rateio ${i + 1}/${linked.length}`
            : baseDesc || undefined;
        const entry: TechnicianFinanceEntry = {
          id: entryId,
          kind: partial.kind,
          amount: amounts[i] ?? 0,
          currency: partial.currency || 'BRL',
          description: desc,
          taskId,
          templateId: null,
          fieldId: null,
          scopeSuffix: '',
          source: 'manual',
          createdAt: new Date().toISOString(),
          attachments: i === 0 ? atts : undefined,
        };
        await TechnicianFinanceService.saveEntry(entry, ownerEmail);
        if (!firstSaved) firstSaved = entry;
        await injectManualFinanceLineIntoTaskDraft({
          taskId,
          entryId,
          kind: partial.kind,
          amount: entry.amount,
          description: desc,
        });
      }
      return firstSaved!;
    }

    const entry: TechnicianFinanceEntry = {
      id: `tech_fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      kind: partial.kind,
      amount: total,
      currency: partial.currency || 'BRL',
      description: partial.description,
      taskId: null,
      templateId: null,
      fieldId: null,
      scopeSuffix: '',
      source: 'manual',
      createdAt: new Date().toISOString(),
      attachments:
        partial.attachments && partial.attachments.length > 0 ? partial.attachments : undefined,
    };
    await TechnicianFinanceService.saveEntry(entry, ownerEmail);
    return entry;
  },
};
