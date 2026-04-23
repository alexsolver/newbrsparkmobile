import { getCurrentLanguage } from './index';
import AsyncStorage from '@react-native-async-storage/async-storage';

const UNIT_KEY = '@brspark_units';

// ── Locale → Currency mapping ────────────────────────────────────────────────
const LOCALE_CURRENCY: Record<string, string> = {
  'pt-BR': 'BRL',
  'en-US': 'USD',
  'es-MX': 'MXN',
  'es-CO': 'COP',
  'es-AR': 'ARS',
  'es-ES': 'EUR',
  'de-DE': 'EUR',
  'en-GB': 'GBP',
};

// ── Imperial locales ─────────────────────────────────────────────────────────
const IMPERIAL_LOCALES = ['en-US'];
let _useImperial: boolean | null = null;

export async function loadUnitPreference() {
  const pref = await AsyncStorage.getItem(UNIT_KEY);
  if (pref !== null) _useImperial = pref === 'imperial';
}

export async function setUnitSystem(imperial: boolean) {
  _useImperial = imperial;
  await AsyncStorage.setItem(UNIT_KEY, imperial ? 'imperial' : 'metric');
}

export function isImperial(): boolean {
  if (_useImperial !== null) return _useImperial;
  return IMPERIAL_LOCALES.includes(getCurrentLanguage());
}

// ── Number Format Preferences ─────────────────────────────────────────────────
const NUMBER_FORMAT_KEY = '@brspark_number_format';

export type NumberFormatStyle = 'locale' | 'dot-comma' | 'comma-dot';
export type NumberFormatPrefs = { decimals: 0 | 1 | 2 | 3; style: NumberFormatStyle };

let _numberFormat: NumberFormatPrefs | null = null;

export async function loadNumberFormatPreference() {
  try {
    const raw = await AsyncStorage.getItem(NUMBER_FORMAT_KEY);
    if (raw) _numberFormat = JSON.parse(raw);
  } catch { /* ignore */ }
}

export async function setNumberFormat(prefs: NumberFormatPrefs) {
  _numberFormat = prefs;
  await AsyncStorage.setItem(NUMBER_FORMAT_KEY, JSON.stringify(prefs));
}

export function getNumberFormat(): NumberFormatPrefs {
  if (_numberFormat) return _numberFormat;
  const lang = getCurrentLanguage();
  const style: NumberFormatStyle =
    lang === 'en-US' || lang === 'en-GB' ? 'comma-dot' : 'dot-comma';
  return { decimals: 2, style };
}

/** Decimal com preferências do utilizador (alinhado a `ValueInput` / campos número). */
export function formatDecimalNumber(amount: number): string {
  const fmt = getNumberFormat();
  return applyStyle(amount, fmt.decimals, fmt.style);
}

function applyStyle(value: number, decimals: number, style: NumberFormatStyle): string {
  if (style === 'locale') {
    const loc = getCurrentLanguage();
    return value.toLocaleString(loc, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  const fixed = value.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const thousandSep = style === 'dot-comma' ? '.' : ',';
  const decimalSep  = style === 'dot-comma' ? ',' : '.';
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
  return decPart !== undefined ? `${withThousands}${decimalSep}${decPart}` : withThousands;
}

// ── Currency ─────────────────────────────────────────────────────────────────
export function formatCurrency(amount: number, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  const currency = LOCALE_CURRENCY[loc] || 'USD';
  const fmt = getNumberFormat();
  if (fmt.style === 'locale') {
    try {
      return new Intl.NumberFormat(loc, {
        style: 'currency', currency,
        minimumFractionDigits: fmt.decimals,
        maximumFractionDigits: fmt.decimals,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(fmt.decimals)}`;
    }
  }
  const symbols: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€', GBP: '£', MXN: '$', COP: '$', ARS: '$' };
  return `${symbols[currency] || currency} ${applyStyle(amount, fmt.decimals, fmt.style)}`;
}

export function formatCurrencyShort(amount: number, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  const currency = LOCALE_CURRENCY[loc] || 'USD';
  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

// ── Date/Time ────────────────────────────────────────────────────────────────
export function formatDate(date: string | Date, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(loc);
}

export function formatDateShort(date: string | Date, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
}

export function formatDateLong(date: string | Date, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(loc, { day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatDateTime(date: string | Date, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(loc, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatMonthYear(date: Date, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  return date.toLocaleString(loc, { month: 'long', year: 'numeric' });
}

export function formatDayMonth(date: string | Date, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(loc, { day: '2-digit', month: 'long' });
}

// ── Numbers ──────────────────────────────────────────────────────────────────
export function formatNumber(num: number, locale?: string, decimals?: number): string {
  const fmt = getNumberFormat();
  const d = decimals ?? fmt.decimals;
  return applyStyle(num, d, fmt.style);
}

export function formatPercent(value: number, locale?: string): string {
  const loc = locale || getCurrentLanguage();
  return `${value.toLocaleString(loc, { maximumFractionDigits: 0 })}%`;
}

// ── Distance ─────────────────────────────────────────────────────────────────
export function formatDistance(km: number): string {
  if (isImperial()) {
    const mi = km * 0.621371;
    return `${formatNumber(mi, undefined, 1)} mi`;
  }
  return `${formatNumber(km, undefined, 1)} km`;
}

// ── Area ─────────────────────────────────────────────────────────────────────
export function formatArea(m2: number): string {
  if (isImperial()) {
    const sqft = m2 * 10.7639;
    return `${formatNumber(sqft, undefined, 0)} sq ft`;
  }
  return `${formatNumber(m2, undefined, 0)} m²`;
}

// ── Volume ───────────────────────────────────────────────────────────────────
export function formatVolume(liters: number): string {
  if (isImperial()) {
    const gal = liters * 0.264172;
    return `${formatNumber(gal, undefined, 1)} gal`;
  }
  return `${formatNumber(liters, undefined, 1)} L`;
}

// ── Weight ───────────────────────────────────────────────────────────────────
export function formatWeight(kg: number): string {
  if (isImperial()) {
    const lb = kg * 2.20462;
    return `${formatNumber(lb, undefined, 1)} lb`;
  }
  return `${formatNumber(kg, undefined, 1)} kg`;
}

// ── Temperature ──────────────────────────────────────────────────────────────
export function formatTemperature(celsius: number): string {
  if (isImperial()) {
    const f = celsius * 1.8 + 32;
    return `${formatNumber(f, undefined, 0)}°F`;
  }
  return `${formatNumber(celsius, undefined, 0)}°C`;
}

// ── Length ────────────────────────────────────────────────────────────────────
export function formatLength(meters: number): string {
  if (isImperial()) {
    const ft = meters * 3.28084;
    return `${formatNumber(ft, undefined, 1)} ft`;
  }
  return `${formatNumber(meters, undefined, 1)} m`;
}

// ── Stock UOM labels ─────────────────────────────────────────────────────────
export function formatStockUnit(unit: string, quantity?: number): string {
  const q = quantity ?? 0;
  if (isImperial()) {
    const map: Record<string, string> = {
      'un': q === 1 ? 'unit' : 'units',
      'lt': q === 1 ? 'gal' : 'gal',
      'kg': q === 1 ? 'lb' : 'lb',
      'mt': q === 1 ? 'ft' : 'ft',
      'pct': q === 1 ? 'pack' : 'packs',
    };
    return map[unit] || unit;
  }
  const map: Record<string, string> = {
    'un': q === 1 ? 'un' : 'un',
    'lt': 'L',
    'kg': 'kg',
    'mt': 'm',
    'pct': q === 1 ? 'pct' : 'pcts',
  };
  return map[unit] || unit;
}

// Convert stock quantity for display
export function convertStockQuantity(quantity: number, unit: string): number {
  if (!isImperial()) return quantity;
  switch (unit) {
    case 'lt': return quantity * 0.264172; // L → gal
    case 'kg': return quantity * 2.20462;  // kg → lb
    case 'mt': return quantity * 3.28084;  // m → ft
    default: return quantity;
  }
}
