import { warnDev } from './devLog';

/**
 * JSON.parse com fallback e registo em dev — evita crash em dados locais corrompidos.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T, context?: string): T {
  if (raw == null || typeof raw !== 'string') return fallback;
  const t = raw.trim();
  if (!t) return fallback;
  try {
    return JSON.parse(t) as T;
  } catch (e) {
    if (context) warnDev(`safeJsonParse:${context}`, e);
    else warnDev('safeJsonParse', e);
    return fallback;
  }
}

/**
 * `JSON.parse` que devolve `null` em string vazia ou JSON inválido (útil quando `null` JSON é admissível).
 */
export function parseJsonOrNull(raw: string, context?: string): unknown | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch (e) {
    if (context) warnDev(`parseJsonOrNull:${context}`, e);
    else warnDev('parseJsonOrNull', e);
    return null;
  }
}
