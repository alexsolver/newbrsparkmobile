import { apiFetch } from './auth';

const cache = new Map<string, { schema: any[]; ts: number }>();
const TTL_MS = 5 * 60 * 1000;

export function schemaArrayHasTechnicianFinance(schema: any[] | null | undefined): boolean {
  if (!Array.isArray(schema)) return false;
  return schema.some((f) => f && f.type === 'technician_finance');
}

/** Schema do modelo de checklist (campo `schemaData` do GET /api/checklists/templates/:id). */
export async function fetchChecklistTemplateSchema(templateId: string): Promise<any[] | null> {
  const id = String(templateId || '').trim();
  if (!id || id === 'null') return null;
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && now - hit.ts < TTL_MS) return hit.schema;
  try {
    const res = await apiFetch(`/api/checklists/templates/${encodeURIComponent(id)}?_t=${now}`);
    if (!res.ok) return null;
    const tmpl = await res.json();
    const schema = Array.isArray(tmpl?.schemaData) ? tmpl.schemaData : null;
    if (schema) cache.set(id, { schema, ts: now });
    return schema;
  } catch {
    return null;
  }
}
