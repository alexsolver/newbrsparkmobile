import AsyncStorage from '@react-native-async-storage/async-storage';
import { findCloudTaskById } from '../lib/cloudTasksBuckets';
import { taskEffectiveChecklistTemplateId } from '../lib/routineTaskQueueUi';
import { updateStoredJsonArray } from '../lib/asyncStorageAtomic';
import {
  fetchChecklistTemplateSchema,
  isTechnicianFinanceSchemaField,
  technicianFinanceFieldMode,
} from './checklistTemplateSchema';
import type { TechnicianFinanceKind } from '../types/technicianFinance';

/** Rateio em centavos para a soma bater exactamente com o total. */
export function splitCurrencyBrl(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const cents = Math.round(Math.max(0, total) * 100);
  const base = Math.floor(cents / parts);
  const rem = cents % parts;
  const out: number[] = [];
  for (let i = 0; i < parts; i++) {
    const c = base + (i < rem ? 1 : 0);
    out.push(c / 100);
  }
  return out;
}

type FinanceTarget = { kind: 'direct'; fieldId: string } | { kind: 'repeat'; sectionId: string; fieldId: string };

function financeFieldMatchesKind(f: any, financeKind?: TechnicianFinanceKind): boolean {
  if (!isTechnicianFinanceSchemaField(f)) return false;
  if (financeKind == null) return true;
  const mode = technicianFinanceFieldMode(f);
  if (mode === 'expense') return financeKind === 'expense';
  return financeKind === 'revenue';
}

/**
 * Primeiro campo financeiro do técnico no schema (raiz → seções).
 * Com `financeKind`, escolhe o campo cujo tipo corresponde (despesa ou receita).
 */
export function firstTechnicianFinanceTarget(
  schema: any[],
  financeKind?: TechnicianFinanceKind
): FinanceTarget | null {
  if (!Array.isArray(schema)) return null;
  let curRepeat = false;
  let curSid = '';
  for (const f of schema) {
    if (!f || typeof f !== 'object') continue;
    if (f.type === 'section_break') {
      curRepeat = !!f.multiple;
      curSid = f.id != null ? String(f.id) : '';
      continue;
    }
    if (f.type === 'hidden' || !f.id) continue;
    if (!financeFieldMatchesKind(f, financeKind)) continue;
    const fid = String(f.id);
    if (!curRepeat) return { kind: 'direct', fieldId: fid };
    if (curSid) return { kind: 'repeat', sectionId: curSid, fieldId: fid };
  }
  return null;
}

/** Todos os alvos «financeiro técnico» no schema (ordem de leitura). */
function eachTechnicianFinanceTargets(schema: any[]): FinanceTarget[] {
  const out: FinanceTarget[] = [];
  if (!Array.isArray(schema)) return out;
  let curRepeat = false;
  let curSid = '';
  for (const f of schema) {
    if (!f || typeof f !== 'object') continue;
    if (f.type === 'section_break') {
      curRepeat = !!f.multiple;
      curSid = f.id != null ? String(f.id) : '';
      continue;
    }
    if (f.type === 'hidden' || !f.id) continue;
    if (!isTechnicianFinanceSchemaField(f)) continue;
    const fid = String(f.id);
    if (!curRepeat) out.push({ kind: 'direct', fieldId: fid });
    else if (curSid) out.push({ kind: 'repeat', sectionId: curSid, fieldId: fid });
  }
  return out;
}

function mergeFinanceJson(
  prevRaw: unknown,
  line: {
    entryId: string;
    kind: TechnicianFinanceKind;
    amount: number;
    description?: string;
    categoryKey?: string;
  }
): string {
  let parsed: Record<string, unknown> = {};
  try {
    if (typeof prevRaw === 'string') parsed = JSON.parse(prevRaw || '{}') as Record<string, unknown>;
    else if (prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw))
      parsed = { ...(prevRaw as Record<string, unknown>) };
  } catch {
    parsed = {};
  }
  const lines = Array.isArray(parsed.lines) ? [...(parsed.lines as unknown[])] : [];
  const payload: Record<string, unknown> = {
    entryId: line.entryId,
    kind: line.kind,
    amount: line.amount,
  };
  if (
    line.kind === 'expense' &&
    line.categoryKey != null &&
    String(line.categoryKey).trim() !== ''
  ) {
    payload.categoryKey = String(line.categoryKey).trim();
  }
  if (line.description != null && String(line.description).trim() !== '') {
    payload.description = String(line.description).trim();
  }
  const ix = lines.findIndex(
    (l) => l && typeof l === 'object' && String((l as any).entryId) === line.entryId
  );
  if (ix >= 0) lines[ix] = payload;
  else lines.push(payload);
  return JSON.stringify({ v: 1, lines, financeAppliedRev: null });
}

async function cloudTaskRefId(taskId: string): Promise<string | null> {
  try {
    const t = await findCloudTaskById(String(taskId));
    if (!t) return null;
    const ref = taskEffectiveChecklistTemplateId(t);
    return ref || null;
  } catch {
    return null;
  }
}

async function loadMergedResponses(taskId: string): Promise<Record<string, any>> {
  let responses: Record<string, any> = {};
  const ek = `@aria_execution_${taskId}`;
  const exRaw = await AsyncStorage.getItem(ek);
  if (exRaw) {
    try {
      const ex = JSON.parse(exRaw);
      if (ex.responses && typeof ex.responses === 'object' && !Array.isArray(ex.responses)) {
        responses = { ...ex.responses };
      }
    } catch {
      /* ignore */
    }
  }
  const dk = `@draft_tsk_${taskId}`;
  const draftRaw = await AsyncStorage.getItem(dk);
  if (draftRaw) {
    try {
      const d = JSON.parse(draftRaw);
      if (d && typeof d === 'object' && !Array.isArray(d)) {
        responses = { ...responses, ...d };
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const obRaw = await AsyncStorage.getItem('@aria_outbox');
    const ob = obRaw ? JSON.parse(obRaw) : [];
    if (Array.isArray(ob)) {
      const item = ob.find((o: any) => o && String(o.taskId) === String(taskId));
      if (item?.responses && typeof item.responses === 'object' && !Array.isArray(item.responses)) {
        responses = { ...responses, ...item.responses };
      }
    }
  } catch {
    /* ignore */
  }
  return responses;
}

function stripFinanceLineFromJson(prevRaw: unknown, entryId: string): string | null {
  let parsed: Record<string, unknown> = {};
  try {
    if (typeof prevRaw === 'string') parsed = JSON.parse(prevRaw || '{}') as Record<string, unknown>;
    else if (prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw))
      parsed = { ...(prevRaw as Record<string, unknown>) };
  } catch {
    parsed = {};
  }
  const lines = Array.isArray(parsed.lines) ? (parsed.lines as unknown[]).filter(Boolean) : [];
  const next = lines.filter(
    (l) => !(l && typeof l === 'object' && String((l as any).entryId) === String(entryId))
  );
  if (next.length === 0) return null;
  return JSON.stringify({ v: 1, lines: next, financeAppliedRev: parsed.financeAppliedRev ?? null });
}

function applyLineToResponses(
  responses: Record<string, any>,
  target: FinanceTarget,
  line: {
    entryId: string;
    kind: TechnicianFinanceKind;
    amount: number;
    description?: string;
    categoryKey?: string;
  }
) {
  if (target.kind === 'direct') {
    const prev = responses[target.fieldId];
    responses[target.fieldId] = mergeFinanceJson(prev, line);
    return;
  }
  const k = `__section_repeat_${target.sectionId}`;
  let rows = Array.isArray(responses[k]) ? [...responses[k]] : [];
  if (rows.length === 0) rows.push({});
  const row0 = rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0]) ? { ...rows[0] } : {};
  row0[target.fieldId] = mergeFinanceJson(row0[target.fieldId], line);
  rows[0] = row0;
  responses[k] = rows;
}

function applyRemoveLineToResponses(responses: Record<string, any>, target: FinanceTarget, entryId: string) {
  if (target.kind === 'direct') {
    const prev = responses[target.fieldId];
    const next = stripFinanceLineFromJson(prev, entryId);
    if (next == null) delete responses[target.fieldId];
    else responses[target.fieldId] = next;
    return;
  }
  const k = `__section_repeat_${target.sectionId}`;
  let rows = Array.isArray(responses[k]) ? [...responses[k]] : [];
  if (rows.length === 0) return;
  const row0 = rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0]) ? { ...rows[0] } : {};
  const prev = row0[target.fieldId];
  const next = stripFinanceLineFromJson(prev, entryId);
  if (next == null) delete row0[target.fieldId];
  else row0[target.fieldId] = next;
  rows[0] = row0;
  responses[k] = rows;
}

async function persistTaskResponses(taskId: string, responses: Record<string, any>) {
  await AsyncStorage.setItem(`@draft_tsk_${taskId}`, JSON.stringify(responses));
  const ek = `@aria_execution_${taskId}`;
  const exRaw = await AsyncStorage.getItem(ek);
  if (exRaw) {
    try {
      const ex = JSON.parse(exRaw);
      ex.responses = responses;
      await AsyncStorage.setItem(ek, JSON.stringify(ex));
    } catch {
      /* ignore */
    }
  }
  await updateStoredJsonArray<any>('@aria_outbox', (ob) => {
    const ix = ob.findIndex((o) => o && String(o.taskId) === String(taskId));
    if (ix < 0) return ob;
    const next = [...ob];
    next[ix] = { ...next[ix], responses };
    return next;
  });
}

/**
 * Escreve no rascunho / cache de execução / outbox a linha de custos do técnico (mesmo formato do checklist).
 */
export async function injectManualFinanceLineIntoTaskDraft(args: {
  taskId: string;
  entryId: string;
  kind: TechnicianFinanceKind;
  amount: number;
  description?: string;
  categoryKey?: string;
}): Promise<void> {
  const { taskId, entryId, kind, amount, description, categoryKey } = args;
  const refId = await cloudTaskRefId(taskId);
  if (!refId) return;
  const schema = await fetchChecklistTemplateSchema(refId);
  if (!schema) return;
  const target = firstTechnicianFinanceTarget(schema, kind);
  if (!target) return;

  const responses = await loadMergedResponses(taskId);
  applyLineToResponses(responses, target, { entryId, kind, amount, description, categoryKey });
  await persistTaskResponses(taskId, responses);
}

/** Remove uma linha manual do JSON do campo custos do técnico (edição / substituição). */
export async function removeManualFinanceLineFromTaskDraft(taskId: string, entryId: string): Promise<void> {
  const refId = await cloudTaskRefId(taskId);
  if (!refId) return;
  const schema = await fetchChecklistTemplateSchema(refId);
  if (!schema) return;
  const targets = eachTechnicianFinanceTargets(schema);
  if (!targets.length) return;

  const responses = await loadMergedResponses(taskId);
  for (const target of targets) {
    applyRemoveLineToResponses(responses, target, entryId);
  }
  await persistTaskResponses(taskId, responses);
}
