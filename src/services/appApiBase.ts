/**
 * Resolução da origem da API (sem `/api` no fim).
 * Separado de `auth.ts` para reduzir acoplamento e tamanho do módulo de sessão.
 */
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Porta da API (admin-panel/backend + PostgreSQL). */
const DEV_API_PORT = process.env.EXPO_PUBLIC_API_PORT || '3001';

const ENV_DEV_HOST =
  String(
    (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEV_API_HOST) ||
      (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_API_HOST) ||
      '',
  ).trim();

function pushHostCandidate(out: string[], raw: unknown) {
  if (raw && typeof raw === 'string' && raw.trim()) out.push(raw.trim());
}

/** URIs que o Expo preenche com o host do packager (LAN, túnel, etc.). */
function collectExpoBundlerHostUris(): string[] {
  const uris: string[] = [];
  try {
    pushHostCandidate(uris, Constants.expoConfig?.hostUri);
    const m = Constants.manifest;
    if (m && typeof m === 'object' && m !== null && 'debuggerHost' in m) {
      pushHostCandidate(uris, (m as { debuggerHost?: string }).debuggerHost);
    }
    const m2 = Constants.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | null | undefined;
    pushHostCandidate(uris, m2?.extra?.expoClient?.hostUri);
  } catch {
    /* ignore */
  }
  return uris;
}

function isLikelyLocalLanApiBase(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '10.0.2.2') return true;
    if (h.startsWith('192.168.')) return true;
    const p = h.split('.').map((x) => Number(x));
    return p.length === 4 && p[0] === 10 && p.every((n) => !Number.isNaN(n));
  } catch {
    return false;
  }
}

/** Host Metro/Expo (mesmo PC que corre `expo start`) — evita IP fixo errado na Wi‑Fi. */
function inferExpoDevLanHost(): string | null {
  try {
    for (const raw of collectExpoBundlerHostUris()) {
      const host = raw.split(':')[0]?.trim();
      if (!host || host === 'localhost' || host === '127.0.0.1') continue;
      if (!isLikelyLocalLanApiBase(`http://${host}:${DEV_API_PORT}`)) continue;
      return host;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Sem IP fixo no repositório — em telemóvel na LAN use `EXPO_PUBLIC_DEV_API_HOST` ou o host inferido do Metro. */
const MAC_IP =
  ENV_DEV_HOST || inferExpoDevLanHost() || (!Device.isDevice ? '127.0.0.1' : '127.0.0.1');

/** Origem da API em release: só esquema+host (+porta se preciso). Sem `/api` no fim (o app acrescenta `/api/...`). */
function normalizeProductionApiBase(raw: string | undefined): string | undefined {
  if (raw == null || typeof raw !== 'string') return undefined;
  let u = raw.trim().replace(/\/+$/, '');
  if (u.toLowerCase().endsWith('/api')) {
    u = u.slice(0, -4).replace(/\/+$/, '');
  }
  return u.length > 0 ? u : undefined;
}

const PRODUCTION_API_DEFAULT = 'https://api.brspark.com';

const fromEnvRaw = normalizeProductionApiBase(process.env.EXPO_PUBLIC_API_BASE);
/** Em dev, permite forçar produção: `EXPO_PUBLIC_USE_PRODUCTION_API=1` no .env (e `EXPO_PUBLIC_API_BASE` se quiser outro host). */
const forceProductionInDev =
  __DEV__ && String(process.env.EXPO_PUBLIC_USE_PRODUCTION_API || '').trim() === '1';

/**
 * Em dispositivo físico, `http://localhost:3001` / `127.0.0.1` na API apontam para o próprio telemóvel.
 * Se o Metro expõe um host LAN em `expoConfig.hostUri`, substituímos por esse host (mantém a porta do `.env`).
 * Em simulador/emulador, sem host LAN do Expo, mantém-se loopback (acesso ao host da máquina).
 * Em **dispositivo físico**, se ainda não houver host do Metro, use `EXPO_PUBLIC_DEV_API_HOST` (não há IP fixo no código).
 */
function rewriteDevLoopbackApiBaseIfNeeded(apiBase: string): string {
  if (!__DEV__ || Platform.OS === 'web') return apiBase;
  try {
    const u = new URL(String(apiBase || '').trim());
    const h = u.hostname.toLowerCase();
    if (h !== 'localhost' && h !== '127.0.0.1') return apiBase;
    let lanHost = inferExpoDevLanHost();
    if (!lanHost && Device.isDevice) {
      const eh = ENV_DEV_HOST.replace(/^https?:\/\//i, '').split(':')[0]?.trim();
      if (eh && eh !== 'localhost' && eh !== '127.0.0.1') lanHost = eh;
    }
    if (!lanHost) return apiBase;
    const portPart = u.port ? `:${u.port}` : '';
    const next = `${u.protocol}//${lanHost}${portPart}`.replace(/\/+$/, '');
    const prev = apiBase.replace(/\/+$/, '');
    if (next !== prev) {
      console.warn('[BrSpark] API_BASE em loopback no dispositivo — redirecionado para o host LAN:', prev, '→', next);
    }
    return next;
  } catch {
    return apiBase;
  }
}

/**
 * Base da API (origem sem `/api` no fim).
 * - **Release:** `EXPO_PUBLIC_API_BASE` (EAS / build) ou produção por defeito.
 * - **Dev:** se existir `EXPO_PUBLIC_API_BASE` no `.env`, usa-se sempre (LAN, VPN, https público, túnel).
 *   Sem isso: `EXPO_PUBLIC_DEV_API_HOST` → host inferido do Metro (`expoConfig.hostUri`) → loopback + porta (emulador).
 *   `EXPO_PUBLIC_USE_PRODUCTION_API=1` força produção como antes.
 *   Se `EXPO_PUBLIC_API_BASE` for loopback e o Metro indicar host LAN, substitui-se automaticamente (evita erro no telemóvel).
 */
const RESOLVED_API_BASE: string = (() => {
  if (__DEV__) {
    if (forceProductionInDev) {
      return rewriteDevLoopbackApiBaseIfNeeded(fromEnvRaw || PRODUCTION_API_DEFAULT);
    }
    if (fromEnvRaw) {
      return rewriteDevLoopbackApiBaseIfNeeded(fromEnvRaw);
    }
    if (
      Device.isDevice &&
      !ENV_DEV_HOST &&
      !inferExpoDevLanHost() &&
      (MAC_IP === '127.0.0.1' || MAC_IP === 'localhost')
    ) {
      console.warn(
        '[BrSpark] Dispositivo físico sem EXPO_PUBLIC_API_BASE / EXPO_PUBLIC_DEV_API_HOST nem host do Metro — API em loopback provavelmente não alcança o PC. Defina EXPO_PUBLIC_DEV_API_HOST com o IP/hostname da sua máquina.',
      );
    }
    return rewriteDevLoopbackApiBaseIfNeeded(`http://${MAC_IP}:${DEV_API_PORT}`);
  }
  return fromEnvRaw || PRODUCTION_API_DEFAULT;
})();

export const API_BASE = RESOLVED_API_BASE;

if (__DEV__) {
  console.log('[BrSpark] API_BASE →', API_BASE);
}
