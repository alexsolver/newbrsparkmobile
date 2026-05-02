/**
 * Rótulos de campos no schema do checklist por idioma (pt-BR, en-US, es-ES, de-DE).
 * O campo legado `label` é o texto base (pt-BR); `labels` guarda variantes por locale.
 */

export const SCHEMA_PRIMARY_LOCALE = 'pt-BR';

export const SCHEMA_SUPPORTED_LOCALES = ['pt-BR', 'en-US', 'es-ES', 'de-DE'] as const;

export type SchemaLabelField = {
  id?: string;
  label?: string;
  labels?: Record<string, string>;
};

/** Alinha tag de idioma do app (ex.: i18n.language) ao conjunto suportado no schema. */
export function normalizeSchemaLanguageTag(tag: string | undefined | null): string {
  const t = String(tag || SCHEMA_PRIMARY_LOCALE).replace(/_/g, '-');
  const lower = t.toLowerCase();
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en-US';
  if (lower === 'es' || lower.startsWith('es-')) return 'es-ES';
  if (lower === 'de' || lower.startsWith('de-')) return 'de-DE';
  return SCHEMA_PRIMARY_LOCALE;
}

/**
 * Resolve o rótulo visível para o técnico conforme o idioma da UI.
 * Ordem: labels[locale exato] → primeira labels com mesmo prefixo de idioma → `label` → id.
 */
export function getLocalizedSchemaLabel(
  field: SchemaLabelField | null | undefined,
  appLanguage: string | undefined | null,
): string {
  if (!field) return '';
  const loc = normalizeSchemaLanguageTag(appLanguage);
  const by = field.labels;
  if (by && typeof by === 'object' && !Array.isArray(by)) {
    const exact = by[loc];
    if (exact != null && String(exact).trim()) return String(exact);
    const prefix = loc.split('-')[0].toLowerCase();
    for (const k of Object.keys(by)) {
      const kl = k.toLowerCase();
      if (kl === prefix || kl.startsWith(`${prefix}-`)) {
        const v = by[k];
        if (v != null && String(v).trim()) return String(v);
      }
    }
  }
  const legacy = field.label != null ? String(field.label) : '';
  if (legacy.trim()) return legacy;
  return field.id != null ? String(field.id) : '';
}
