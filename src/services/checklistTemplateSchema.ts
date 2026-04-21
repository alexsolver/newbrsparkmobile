import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './auth';

const cache = new Map<string, { schema: any[]; ts: number }>();
const TTL_MS = 5 * 60 * 1000;

const TEMPLATES_STORAGE_KEY = '@brspark_templates';

/**
 * Tipo canónico do campo (alinha ao motor do checklist): `type` + `fieldType` / `kind` legados.
 */
export function effectiveSchemaFieldType(f: any): string {
  const keys = [
    'type',
    'Type',
    'fieldType',
    'field_type',
    'kind',
    'component',
    'controlType',
    'inputType',
  ] as const;
  const normalized: string[] = [];
  for (const k of keys) {
    const raw = f?.[k];
    if (raw == null || raw === '') continue;
    const t = String(raw)
      .trim()
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
    if (t) normalized.push(t);
  }
  const preferFirst = ['signature_summary', 'signature'] as const;
  for (const p of preferFirst) {
    if (normalized.includes(p)) return p;
  }
  const transitPrefer = ['transit_end', 'transit_start'] as const;
  for (const p of transitPrefer) {
    if (normalized.includes(p)) return p;
  }
  const financePrefer = ['technician_finance_expense', 'technician_finance_revenue'] as const;
  for (const p of financePrefer) {
    if (normalized.includes(p)) return p;
  }
  /** `type: number` + `fieldType: currency` → usar moeda (ValueInput), não número simples. */
  if (normalized.includes('currency')) return 'currency';
  let out = normalized[0] || '';

  const alias: Record<string, string> = {
    money: 'currency',
    monetary: 'currency',
  };
  if (out && alias[out]) out = alias[out];

  /** Modelos antigos gravados com `type: technician_finance` → tratados como só despesas. */
  if (out === 'technician_finance') out = 'technician_finance_expense';

  /** Só `currencyCode` (ex.: tipo não sincronizado / chave `Type` em vez de `type`). */
  if (!out) {
    const cc = f?.currencyCode;
    if (cc != null && String(cc).trim() !== '') return 'currency';
  }

  /** Schema com `type: number` mas `currencyCode` do builder de moeda. */
  if (out === 'number' && f?.currencyCode != null && String(f.currencyCode).trim() !== '') {
    return 'currency';
  }

  return out;
}

/** Tipos de campo do motor financeiro técnico (apenas campos dedicados). */
export function isTechnicianFinanceFieldType(t: string | undefined | null): boolean {
  const s = String(t || '').trim().toLowerCase();
  return s === 'technician_finance_expense' || s === 'technician_finance_revenue';
}

export function technicianFinanceFieldMode(f: any): 'expense' | 'revenue' {
  const t = effectiveSchemaFieldType(f);
  if (t === 'technician_finance_revenue') return 'revenue';
  return 'expense';
}

export function isTechnicianFinanceSchemaField(f: any): boolean {
  return isTechnicianFinanceFieldType(effectiveSchemaFieldType(f));
}

export function schemaArrayHasTechnicianFinance(schema: any[] | null | undefined): boolean {
  if (!Array.isArray(schema)) return false;
  return schema.some((f) => f && isTechnicianFinanceSchemaField(f));
}

async function loadTemplateSchemaFromLocalStorage(templateId: string): Promise<any[] | null> {
  try {
    const dbStr = await AsyncStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!dbStr) return null;
    const db = JSON.parse(dbStr);
    if (!db || typeof db !== 'object') return null;
    const tmpl = db[String(templateId).trim()];
    if (!tmpl || typeof tmpl !== 'object') return null;
    return Array.isArray(tmpl.schemaData) ? tmpl.schemaData : null;
  } catch {
    return null;
  }
}

/** Schema do modelo de checklist (campo `schemaData` do GET /api/checklists/templates/:id). */
export async function fetchChecklistTemplateSchema(templateId: string): Promise<any[] | null> {
  const id = String(templateId || '').trim();
  if (!id || id === 'null') return null;
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && now - hit.ts < TTL_MS) return hit.schema;

  let schema: any[] | null = null;
  try {
    const res = await apiFetch(`/api/checklists/templates/${encodeURIComponent(id)}?_t=${now}`);
    if (res.ok) {
      const tmpl = await res.json();
      schema = Array.isArray(tmpl?.schemaData) ? tmpl.schemaData : null;
    }
  } catch {
    schema = null;
  }

  if (!schema) {
    schema = await loadTemplateSchemaFromLocalStorage(id);
  }

  if (schema) {
    cache.set(id, { schema, ts: now });
    return schema;
  }
  return null;
}
