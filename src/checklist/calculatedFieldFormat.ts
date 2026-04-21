import { formatCurrency, formatDecimalNumber, getNumberFormat } from '../i18n/formatters';
import { getCurrentLanguage } from '../i18n/index';
import { effectiveSchemaFieldType } from '../services/checklistTemplateSchema';

export type CalcDisplayFormat = 'auto' | 'number' | 'currency' | 'percent';

/** IDs de campo referidos na fórmula (tokens `field_*` que existem no schema). */
export function fieldIdsReferencedInCalcFormula(formula: string, schema: any[] | undefined): string[] {
  if (!formula || !Array.isArray(schema)) return [];
  const idSet = new Set(schema.map((f) => f?.id).filter(Boolean).map(String));
  const tokenRe = /field_[a-zA-Z0-9_]+/g;
  const tokens = formula.match(tokenRe) || [];
  return [...new Set(tokens.filter((t) => idSet.has(t)))];
}

export function resolveCalcDisplayMode(
  field: any,
  formula: string,
  schema: any[] | undefined,
): 'number' | 'currency' | 'percent' {
  const raw = String(field?.calcDisplayFormat ?? 'auto').trim().toLowerCase();
  if (raw === 'number' || raw === 'currency' || raw === 'percent') return raw;
  const ids = fieldIdsReferencedInCalcFormula(formula, schema);
  if (ids.length === 0) return 'number';
  const types = ids.map((id) => {
    const f = schema?.find((x) => x && String(x.id) === id);
    return f ? effectiveSchemaFieldType(f) : '';
  });
  if (types.length > 0 && types.every((t) => t === 'currency')) return 'currency';
  return 'number';
}

export function formatCalculatedResultDisplay(result: unknown, mode: 'number' | 'currency' | 'percent'): string {
  const n = typeof result === 'number' ? result : Number(result);
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (mode === 'currency') return formatCurrency(n);
  if (mode === 'percent') {
    const loc = getCurrentLanguage();
    const decimals = getNumberFormat().decimals;
    try {
      return new Intl.NumberFormat(loc, {
        style: 'percent',
        minimumFractionDigits: Math.min(decimals, 4),
        maximumFractionDigits: Math.min(decimals, 4),
      }).format(n);
    } catch {
      return `${(n * 100).toFixed(2)}%`;
    }
  }
  return formatDecimalNumber(n);
}
