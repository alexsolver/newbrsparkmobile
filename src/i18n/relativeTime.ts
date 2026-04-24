import type { TFunction } from 'i18next';

/** BCP-47 para `toLocaleDateString` a partir do código do app (pt-BR, en-US, …). */
export function appLangToLocaleTag(lang: string | undefined): string {
  const lng = String(lang || 'pt-BR');
  if (lng.startsWith('de')) return 'de-DE';
  if (lng.startsWith('es')) return 'es-ES';
  if (lng.startsWith('en')) return 'en-US';
  return 'pt-BR';
}

/** Relativo curto (lista de chat): sem sufixo “atrás”. */
export function relTimeShort(ts: number | undefined, t: TFunction, localeTag?: string): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('common.relTime.now');
  if (m < 60) return t('common.relTime.minutes', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('common.relTime.hours', { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('common.relTime.days', { count: d });
  return new Date(ts).toLocaleDateString(appLangToLocaleTag(localeTag), { day: '2-digit', month: '2-digit' });
}

/** Relativo com sufixo (cartões de aviso). */
export function relTimeAgo(ts: number, t: TFunction): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('common.relTime.now');
  if (m < 60) return t('common.relTime.minutesAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('common.relTime.hoursAgo', { count: h });
  return t('common.relTime.daysAgo', { count: Math.floor(h / 24) });
}
