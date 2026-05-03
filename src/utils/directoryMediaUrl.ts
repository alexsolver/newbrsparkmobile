import { API_BASE } from '../services/appApiBase';

function envTrim(key: string): string {
  if (typeof process === 'undefined') return '';
  const v = process.env[key as keyof NodeJS.ProcessEnv];
  return typeof v === 'string' ? v.trim() : '';
}

function stripCmsOrigin(raw: string): string {
  return raw.replace(/\/$/, '').replace(/\/api\/?$/i, '');
}

/** Mesma origem que o app já usa — o Node faz proxy ao Laravel (evita ATS iOS em HTTP para IP local). */
function storageProxyUrl(pathFromRoot: string): string {
  const api = API_BASE.replace(/\/$/, '');
  return `${api}/api/directory-media?path=${encodeURIComponent(pathFromRoot)}`;
}

/**
 * O Node costuma enviar `http://127.0.0.1:8000` (onde o Laravel responde no PC).
 * No telefone na Wi‑Fi isso não carrega — usamos o mesmo host que `API_BASE` (ex.: 192.168.x.x)
 * e mantemos a porta do URL do CMS (ex.: :8000).
 */
function replaceLoopbackHostWithApiLanHost(originOrAbsolute: string): string {
  const raw = originOrAbsolute.trim();
  if (!raw) return raw;
  try {
    const normalized = raw.includes('://') ? raw : `http://${raw}`;
    const cms = new URL(normalized);
    const h = cms.hostname.toLowerCase();
    if (h !== '127.0.0.1' && h !== 'localhost') return stripCmsOrigin(raw);
    const api = new URL(API_BASE.includes('://') ? API_BASE : `http://${API_BASE}`);
    const apiH = api.hostname.toLowerCase();
    if (apiH === h || apiH === 'localhost' || apiH === '127.0.0.1') return stripCmsOrigin(raw);
    cms.hostname = api.hostname;
    return cms.toString().replace(/\/$/, '');
  } catch {
    return stripCmsOrigin(raw);
  }
}

/**
 * Origem do Laravel devolvida por GET /api/config (`directoryCmsOrigin`).
 * `undefined` = ainda não consultámos; `null` = servidor sem origem útil; `string` = usar.
 */
let cmsOriginFromServer: string | null | undefined = undefined;

/** Chamado após GET /api/config (sync ou diretório). */
export function primeDirectoryCmsOriginFromConfig(config: { directoryCmsOrigin?: string | null } | null | undefined) {
  if (!config || typeof config !== 'object') return;
  if (!('directoryCmsOrigin' in config)) return;
  const raw = config.directoryCmsOrigin;
  if (typeof raw === 'string' && raw.trim()) {
    cmsOriginFromServer = stripCmsOrigin(raw.trim());
    return;
  }
  cmsOriginFromServer = null;
}

/**
 * Garante que tentámos obter `directoryCmsOrigin` do Node (mesma origem que o BFF usa para o Laravel).
 */
export async function ensureDirectoryCmsOriginLoaded(): Promise<void> {
  if (cmsOriginFromServer !== undefined) return;
  if (envTrim('EXPO_PUBLIC_CMS_PUBLIC_ORIGIN') || envTrim('EXPO_PUBLIC_CMS_DIRECTORY_BASE_URL')) {
    cmsOriginFromServer = null;
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/api/config`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) {
      cmsOriginFromServer = null;
      return;
    }
    const j = await r.json();
    primeDirectoryCmsOriginFromConfig(j);
    if (cmsOriginFromServer === undefined) {
      cmsOriginFromServer = null;
    }
  } catch {
    cmsOriginFromServer = null;
  }
}

/**
 * URI absoluta para `Image` do React Native.
 * Ficheiros `/storage/...` do CMS passam pelo proxy do Node (`/api/directory-media`) — mesma origem que `API_BASE`
 * (resolve bloqueio ATS no iOS a HTTP em IP da rede local).
 */
export function resolveDirectoryMediaUri(href: string | null | undefined): string {
  if (href == null) return '';
  const t = String(href).trim();
  if (!t) return '';

  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (u.pathname.startsWith('/storage/')) {
        return storageProxyUrl(u.pathname + u.search);
      }
    } catch {
      /* continuar */
    }
    return replaceLoopbackHostWithApiLanHost(t);
  }

  if (t.startsWith('//')) return `https:${t}`;

  const path = t.startsWith('/') ? t : `/${t}`;
  if (path.startsWith('/storage/')) {
    return storageProxyUrl(path);
  }

  const fromEnvRaw =
    envTrim('EXPO_PUBLIC_CMS_PUBLIC_ORIGIN') || envTrim('EXPO_PUBLIC_CMS_DIRECTORY_BASE_URL');
  if (fromEnvRaw) {
    const base = replaceLoopbackHostWithApiLanHost(stripCmsOrigin(fromEnvRaw));
    return `${base}${path}`;
  }

  if (typeof cmsOriginFromServer === 'string' && cmsOriginFromServer.trim()) {
    const base = replaceLoopbackHostWithApiLanHost(cmsOriginFromServer.trim());
    return `${base}${path}`;
  }

  try {
    const normalized = API_BASE.includes('://') ? API_BASE : `http://${API_BASE}`;
    const u = new URL(normalized);
    const p = u.port;
    const portOverride = envTrim('EXPO_PUBLIC_CMS_LARAVEL_PORT');
    if (portOverride && (p === '3001' || p === '3000')) {
      return `${u.protocol}//${u.hostname}:${portOverride.replace(/^:/, '')}${path}`;
    }
    if (p === '3001' || p === '3000') {
      return `${u.protocol}//${u.hostname}:8000${path}`;
    }
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return path;
  }
}
