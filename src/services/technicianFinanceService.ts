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
  areTaskIdsEligibleForExpenseLink,
  linkedTasksAllowFullEditAfterReview,
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
  const ck =
    row.category_key != null && String(row.category_key).trim() !== ''
      ? String(row.category_key).trim()
      : row.categoryKey != null && String(row.categoryKey).trim() !== ''
        ? String(row.categoryKey).trim()
        : null;
  return {
    id: row.id,
    kind: row.kind === 'revenue' ? 'revenue' : 'expense',
    amount: Number(row.amount) || 0,
    currency: row.currency || 'BRL',
    categoryKey: ck,
    description: row.description || undefined,
    linkedTaskIds: parseLinkedTaskIds(row),
    taskId: row.taskId ?? null,
    templateId: row.templateId ?? null,
    fieldId: row.fieldId ?? null,
    scopeSuffix: row.scopeSuffix ?? '',
    source: row.source === 'checklist' ? 'checklist' : 'manual',
    createdAt: row.createdAt || new Date().toISOString(),
    attachments: parseAttachments(row),
    financeValueUnlocked:
      row.finance_value_unlocked === 1 ||
      row.finance_value_unlocked === true ||
      row.financeValueUnlocked === true,
    splitGroupId:
      row.split_group_id != null && String(row.split_group_id).trim() !== ''
        ? String(row.split_group_id).trim()
        : row.splitGroupId != null && String(row.splitGroupId).trim() !== ''
          ? String(row.splitGroupId).trim()
          : undefined,
    receiptRealizedAt:
      row.receipt_realized_at != null && String(row.receipt_realized_at).trim() !== ''
        ? String(row.receipt_realized_at).trim()
        : row.receiptRealizedAt != null && String(row.receiptRealizedAt).trim() !== ''
          ? String(row.receiptRealizedAt).trim()
          : null,
  };
}

function baseDescNoRateio(desc?: string): string {
  if (!desc) return '';
  return desc.replace(/\s*\(rateio\s+\d+\s*\/\s*\d+\)\s*$/i, '').trim();
}

function prevBaseDescriptionFromEntries(entries: TechnicianFinanceEntry[]): string {
  let best = '';
  for (const e of entries) {
    const b = baseDescNoRateio(e.description);
    if (b && (!best || b.length > best.length)) best = b;
  }
  return best.trim();
}

function attachmentsFingerprint(a?: TechnicianFinanceAttachment[]): string {
  if (!a || a.length === 0) return '';
  return JSON.stringify(
    [...a]
      .map((x) => ({ uri: x.uri, name: x.name, mimeType: x.mimeType }))
      .sort((u, v) => String(u.uri).localeCompare(String(v.uri)))
  );
}

/** Todas as OS ligadas existem em `cloudTasks` (lista sincronizada no aparelho). */
export function manualFinanceLinkedTasksOnDevice(
  entry: TechnicianFinanceEntry,
  cloudTasks: any[]
): boolean {
  if (entry.source === 'checklist') return false;
  const tids = linkedTaskIdsForEntry(entry);
  if (tids.length === 0) return true;
  const map = new Map<string, unknown>();
  for (const t of cloudTasks) {
    if (t?.id != null) map.set(String(t.id), t);
  }
  return tids.every((id) => map.has(id));
}

/**
 * Despesa manual com rateio: dá para ajustar OS no aparelho se cada parte tiver `taskId` presente em `cloudTasks`.
 */
export function isManualSplitRateioEditableInMemory(
  parts: TechnicianFinanceEntry[],
  cloudTasks: any[]
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
    return manualFinanceLinkedTasksOnDevice(parts[0], cloudTasks);
  }

  if (parts.some((p) => !p.taskId)) return false;

  const map = new Map<string, any>();
  for (const t of cloudTasks) {
    if (t?.id != null) map.set(String(t.id), t);
  }

  for (const tid of distinct) {
    if (!map.has(tid)) return false;
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
        finance_value_unlocked: entry.financeValueUnlocked ? 1 : 0,
        split_group_id:
          entry.splitGroupId != null && String(entry.splitGroupId).trim() !== ''
            ? String(entry.splitGroupId).trim()
            : null,
        receipt_realized_at:
          entry.receiptRealizedAt != null && String(entry.receiptRealizedAt).trim() !== ''
            ? String(entry.receiptRealizedAt).trim()
            : null,
        owner_email: ownerEmail || null,
      },
      ownerEmail
    );
  },

  /** Receita do checklist: marca como efetivamente recebida (controla «lançada» → «realizada»). */
  markRevenueAsReceived: async (id: string, ownerEmail?: string): Promise<void> => {
    const raw = getTechFinanceRowById(id);
    if (!raw) throw new Error('Lançamento não encontrado.');
    const entry = rowToEntry(raw);
    if (entry.kind !== 'revenue') throw new Error('Apenas receitas podem ser confirmadas.');
    if (entry.source !== 'checklist') return;
    if (entry.receiptRealizedAt) return;
    await TechnicianFinanceService.saveEntry(
      { ...entry, receiptRealizedAt: new Date().toISOString() },
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
      /** Só despesas; chave da metatag no painel. */
      categoryKey?: string | null;
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

    const valueUnlocked = entries.length > 0 && entries.every((e) => e.financeValueUnlocked === true);
    const prevTotal = entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const prevDescBase = prevBaseDescriptionFromEntries(entries);
    const prevAtt = entries[0]?.attachments;
    const prevFp = attachmentsFingerprint(prevAtt);

    const nextAmount = Math.max(0, Number(fields.amount) || 0);
    const amountChanged = Math.abs(nextAmount - prevTotal) > 0.009;
    const descChanged = String(fields.description || '').trim() !== prevDescBase;
    const nextFp = attachmentsFingerprint(fields.attachments);
    const attChanged = nextFp !== prevFp;

    const hadLinkedOs = oldTids.size > 0;
    const lockExpenseCore = kind0 === 'expense' && hadLinkedOs && !valueUnlocked;

    if (lockExpenseCore) {
      if (fields.kind !== 'expense') {
        throw new Error(
          'Não é possível alterar o tipo deste lançamento com OS vinculadas. Peça revisão ao escritório se necessário.'
        );
      }
      if (amountChanged) {
        throw new Error(
          'O valor está fechado. Peça ao escritório que devolva o lançamento para revisão para alterar montante, descrição ou anexos.'
        );
      }
      if (descChanged) {
        throw new Error(
          'A descrição está fechada. Peça devolução para revisão ou altere apenas as OS no rateio.'
        );
      }
      if (attChanged) {
        throw new Error(
          'Os anexos estão fechados. Peça devolução para revisão ou altere apenas as OS no rateio.'
        );
      }
    }

    if (valueUnlocked && (amountChanged || descChanged || attChanged)) {
      const checkIds = newLinked.length > 0 ? newLinked : [...oldTids];
      if (checkIds.length > 0) {
        const okR = await linkedTasksAllowFullEditAfterReview(checkIds);
        if (!okR) {
          throw new Error(
            'Para corrigir este lançamento devolvido, sincronize o celular: todas as OS do rateio têm de estar na lista local.'
          );
        }
      }
    }

    if (newLinked.length > 0) {
      const ok2 = await areTaskIdsEligibleForExpenseLink(newLinked);
      if (!ok2) {
        throw new Error(
          'Só pode relacionar OS com campo de despesas no modelo, em aberto ou concluídas há no máximo 30 dias, após sincronizar a lista neste celular.'
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
        categoryKey: fields.kind === 'expense' ? fields.categoryKey ?? null : null,
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
      categoryKey?: string | null;
      attachments?: TechnicianFinanceAttachment[];
      linkedTaskIds?: string[];
    },
    ownerEmail?: string
  ): Promise<TechnicianFinanceEntry> => {
    const total = Math.max(0, Number(partial.amount) || 0);
    const expenseCat =
      partial.kind === 'expense' && partial.categoryKey != null && String(partial.categoryKey).trim() !== ''
        ? String(partial.categoryKey).trim()
        : null;
    const linked =
      partial.kind === 'expense' && partial.linkedTaskIds && partial.linkedTaskIds.length > 0
        ? [...new Set(partial.linkedTaskIds.map((id) => String(id).trim()).filter(Boolean))]
        : [];

    if (linked.length > 0) {
      const eligible = await areTaskIdsEligibleForExpenseLink(linked);
      if (!eligible) {
        throw new Error(
          'Só pode associar OS com campo de despesas no formulário, em aberto neste celular ou concluídas há no máximo 30 dias. Sincronize a lista de OS.'
        );
      }
      const amounts = splitCurrencyBrl(total, linked.length);
      const baseDesc = partial.description?.trim() || '';
      const atts =
        partial.attachments && partial.attachments.length > 0 ? partial.attachments : undefined;
      let firstSaved: TechnicianFinanceEntry | null = null;
      const t0 = Date.now();
      const splitGroupId =
        linked.length > 1 ? `mg_${t0}_${Math.random().toString(36).slice(2, 11)}` : undefined;
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
          categoryKey: expenseCat,
          description: desc,
          taskId,
          templateId: null,
          fieldId: null,
          scopeSuffix: '',
          source: 'manual',
          createdAt: new Date().toISOString(),
          attachments: i === 0 ? atts : undefined,
          splitGroupId,
          linkedTaskIds: linked,
          receiptRealizedAt: partial.kind === 'revenue' ? new Date().toISOString() : null,
        };
        await TechnicianFinanceService.saveEntry(entry, ownerEmail);
        if (!firstSaved) firstSaved = entry;
        await injectManualFinanceLineIntoTaskDraft({
          taskId,
          entryId,
          kind: partial.kind,
          amount: entry.amount,
          description: desc,
          categoryKey: expenseCat ?? undefined,
        });
      }
      return firstSaved!;
    }

    const entry: TechnicianFinanceEntry = {
      id: `tech_fin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      kind: partial.kind,
      amount: total,
      currency: partial.currency || 'BRL',
      categoryKey: expenseCat,
      description: partial.description,
      taskId: null,
      templateId: null,
      fieldId: null,
      scopeSuffix: '',
      source: 'manual',
      createdAt: new Date().toISOString(),
      attachments:
        partial.attachments && partial.attachments.length > 0 ? partial.attachments : undefined,
      receiptRealizedAt: partial.kind === 'revenue' ? new Date().toISOString() : null,
    };
    await TechnicianFinanceService.saveEntry(entry, ownerEmail);
    return entry;
  },
};
