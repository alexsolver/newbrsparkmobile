/**
 * Base URL do OSRM: prioridade EXPO_PUBLIC_OSRM_BASE_URL → GET /api/config (integração painel) → demo público.
 */
import { API_BASE } from './auth';

export const OSRM_FALLBACK_BASE = 'https://router.project-osrm.org';

const SUFFIXES = [
  '/match/v1/driving',
  '/route/v1/driving',
  '/table/v1/driving',
  '/trip/v1/driving',
  '/nearest/v1/driving',
];

export function normalizeOsrmBaseUrl(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return OSRM_FALLBACK_BASE;
  let u = raw.trim().replace(/\/+$/, '');
  for (const s of SUFFIXES) {
    const L = s.length;
    if (u.length >= L && u.slice(-L).toLowerCase() === s.toLowerCase()) {
      u = u.slice(0, -L).replace(/\/+$/, '');
      break;
    }
  }
  return u || OSRM_FALLBACK_BASE;
}

const ENV_OVERRIDE =
  typeof process.env.EXPO_PUBLIC_OSRM_BASE_URL === 'string'
    ? process.env.EXPO_PUBLIC_OSRM_BASE_URL.trim()
    : '';

let mem: { url: string; ts: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Após sync de /api/config — só atualiza se o backend enviar URL (evita sobrescrever com demo público) */
export function primeOsrmBaseFromConfig(config: { osrmBaseUrl?: string } | null | undefined) {
  if (ENV_OVERRIDE || !config) return;
  const raw = config.osrmBaseUrl;
  if (typeof raw !== 'string' || !raw.trim()) return;
  const u = normalizeOsrmBaseUrl(raw);
  mem = { url: u, ts: Date.now() };
}

export async function getOsrmBaseUrl(): Promise<string> {
  if (ENV_OVERRIDE) return normalizeOsrmBaseUrl(ENV_OVERRIDE);
  const now = Date.now();
  if (mem && now - mem.ts < TTL_MS) return mem.url;
  try {
    const res = await fetch(`${API_BASE}/api/config`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('config');
    const j = await res.json();
    if (typeof j?.osrmBaseUrl === 'string' && j.osrmBaseUrl.trim()) {
      const u = normalizeOsrmBaseUrl(j.osrmBaseUrl);
      mem = { url: u, ts: now };
      return u;
    }
    if (mem?.url) return mem.url;
    mem = { url: OSRM_FALLBACK_BASE, ts: now };
    return OSRM_FALLBACK_BASE;
  } catch {
    if (mem?.url) return mem.url;
    mem = { url: OSRM_FALLBACK_BASE, ts: now };
    return OSRM_FALLBACK_BASE;
  }
}

/**
 * Lista de bases para geometria no telemóvel: a integração pode apontar para um OSRM interno inacessível no 4G;
 * tentamos também o demo público (deduplicado).
 */
export async function getOsrmRoutingBaseCandidates(): Promise<string[]> {
  const primary = normalizeOsrmBaseUrl(await getOsrmBaseUrl());
  const fb = normalizeOsrmBaseUrl(OSRM_FALLBACK_BASE);
  const out: string[] = [];
  if (primary) out.push(primary);
  if (fb && fb !== primary) out.push(fb);
  return out;
}
