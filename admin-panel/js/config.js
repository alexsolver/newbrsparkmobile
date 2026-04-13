/**
 * config.js — Frontend API configuration
 * O painel precisa da API Prisma + PostgreSQL (pasta admin-panel/backend).
 * A API oficial é admin-panel/backend (PostgreSQL). A pasta backend/ só repassa npm start → mesma API.
 */
const LS_API_ORIGIN = 'brspark_admin_api_origin';

/** Cópia da sessão do painel (JWT + metadados) — partilhada entre separadores; limpa no logout e em 401. */
const LS_ADMIN_SESSION_BUNDLE = 'brspark_admin_session_bundle';

/**
 * Grava no `localStorage` o mesmo conteúdo relevante do `sessionStorage` (login válido).
 * Permite abrir `operations.html` / PDF noutro separador sem perder o Bearer.
 */
export function persistAdminSessionBundleFromSessionStorage() {
  if (typeof window === 'undefined' || !window.sessionStorage || !window.localStorage) return;
  try {
    const token = sessionStorage.getItem('brspark_admin_token');
    if (!token) {
      localStorage.removeItem(LS_ADMIN_SESSION_BUNDLE);
      return;
    }
    const bundle = {
      token,
      email: sessionStorage.getItem('brspark_admin_email') || '',
      name: sessionStorage.getItem('brspark_admin_name') || '',
      role: sessionStorage.getItem('brspark_admin_role') || '',
      panelMode: sessionStorage.getItem('brspark_panel_mode') || '',
      panelTenant: sessionStorage.getItem('brspark_panel_tenant') || '',
    };
    localStorage.setItem(LS_ADMIN_SESSION_BUNDLE, JSON.stringify(bundle));
  } catch {
    /* quota / modo privado */
  }
}

/** Se não há token neste separador, repõe a partir do bundle (outro separador com a mesma sessão). */
export function restoreAdminSessionBundleIfNeeded() {
  if (typeof window === 'undefined' || !window.sessionStorage || !window.localStorage) return;
  try {
    if (sessionStorage.getItem('brspark_admin_token')) return;
    const raw = localStorage.getItem(LS_ADMIN_SESSION_BUNDLE);
    if (!raw) return;
    const b = JSON.parse(raw);
    if (!b || typeof b !== 'object' || !b.token) return;
    sessionStorage.setItem('brspark_admin_token', String(b.token));
    if (b.email) sessionStorage.setItem('brspark_admin_email', String(b.email));
    if (b.name != null) sessionStorage.setItem('brspark_admin_name', String(b.name));
    if (b.role != null) sessionStorage.setItem('brspark_admin_role', String(b.role));
    if (b.panelMode != null) sessionStorage.setItem('brspark_panel_mode', String(b.panelMode));
    if (b.panelTenant != null && String(b.panelTenant).trim() !== '') {
      sessionStorage.setItem('brspark_panel_tenant', String(b.panelTenant));
    }
  } catch {
    /* JSON inválido */
  }
}

export function clearAdminSessionBundle() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LS_ADMIN_SESSION_BUNDLE);
  } catch {
    /* ignore */
  }
}

/** Logout / 401: apaga sessão em memória e o espelho em disco. */
export function clearAdminSessionFully() {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
  } catch {
    /* ignore */
  }
  clearAdminSessionBundle();
}

/** Base da API após ensureAdminApiDetected() — evita usar Live Server (:5500) como API. */
let _apiBase = null;

/**
 * Garante exatamente um sufixo `/api` na URL completa (origem + path).
 * Evita `…/api/api/auth/…` → 404 "Route not found" no Express.
 */
export function normalizeApiBaseUrl(fullBase) {
  let s = String(fullBase || '').trim().replace(/\/+$/, '');
  if (!s) return 'http://127.0.0.1:3001/api';
  while (/\/api$/i.test(s)) {
    s = s.slice(0, -4);
  }
  return `${s}/api`;
}

/** Origem sem barra final; se alguém gravou …/api no localStorage, não duplicar ao acrescentar /api. */
function normalizeStoredApiOrigin(raw) {
  let s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return s;
  try {
    const u = new URL(s);
    const path = (u.pathname || '').replace(/\/+$/, '');
    if (path.toLowerCase() === '/api') {
      u.pathname = '';
      return u.origin;
    }
  } catch {
    /* ignore */
  }
  if (/^https?:\/\/.+\/api$/i.test(s)) {
    return s.slice(0, -4);
  }
  return s;
}

/**
 * Se o painel está em localhost/127.0.0.1 na mesma porta que a origem gravada no localStorage,
 * usa sempre o hostname da página atual. Evita misturar localhost vs 127.0.0.1 (origens diferentes
 * no browser) — o GET pode parecer OK e o POST / CORS falhar ou ficar pendente.
 */
function normalizeLoopbackApiOrigin(storedOrigin) {
  if (typeof window === 'undefined' || !window.location?.hostname) return storedOrigin;
  try {
    const a = new URL(String(storedOrigin).replace(/\/$/, ''));
    const b = window.location;
    const aPort = a.port || (a.protocol === 'https:' ? '443' : '80');
    const bPort = b.port || (b.protocol === 'https:' ? '443' : '80');
    const aLoop = a.hostname === 'localhost' || a.hostname === '127.0.0.1';
    const bLoop = b.hostname === 'localhost' || b.hostname === '127.0.0.1';
    if (aLoop && bLoop && aPort === bPort && a.protocol === b.protocol) {
      return `${b.protocol}//${b.hostname}${b.port ? `:${b.port}` : ''}`;
    }
  } catch {
    /* ignore */
  }
  return String(storedOrigin).replace(/\/$/, '');
}

/**
 * Origem gravada no PC (127.0.0.1/localhost) é inútil no telemóvel/tablet na LAN:
 * aí `localhost` é o próprio dispositivo. Ignorar e voltar a detetar pela página.
 */
function storedLoopbackMismatchLanPage(storedOrigin) {
  if (typeof window === 'undefined' || !window.location?.hostname) return false;
  const pageH = window.location.hostname;
  if (pageH === 'localhost' || pageH === '127.0.0.1') return false;
  try {
    const u = new URL(String(storedOrigin || '').replace(/\/$/, ''));
    const sh = u.hostname;
    if (sh === 'localhost' || sh === '127.0.0.1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** GET /api/plans sem token → API Prisma responde 401 JSON. */
async function isPrismaAdminApi(baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/plans`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const ct = (r.headers.get('content-type') || '').includes('application/json');
    return ct && (r.status === 401 || r.status === 403 || r.status === 200);
  } catch {
    return false;
  }
}

/**
 * Descobre o admin-panel/backend (PostgreSQL). Grava origem no localStorage se precisar
 * (ex.: painel aberto via Live Server).
 */
export async function ensureAdminApiDetected() {
  if (typeof window === 'undefined') return;
  if (_apiBase) return;

  const ls = localStorage.getItem(LS_API_ORIGIN);
  if (ls) {
    const origin = normalizeLoopbackApiOrigin(normalizeStoredApiOrigin(ls));
    if (storedLoopbackMismatchLanPage(origin)) {
      try {
        localStorage.removeItem(LS_API_ORIGIN);
      } catch {
        /* ignore */
      }
    } else {
      if (origin !== String(ls).replace(/\/$/, '')) {
        try {
          localStorage.setItem(LS_API_ORIGIN, origin);
        } catch {
          /* ignore */
        }
      }
      _apiBase = normalizeApiBaseUrl(`${origin}/api`);
      return;
    }
  }

  if (window.location?.protocol !== 'file:' && window.location?.hostname) {
    const same = normalizeApiBaseUrl(`${window.location.origin}/api`);
    if (await isPrismaAdminApi(same)) {
      _apiBase = same;
      return;
    }
    const h = window.location.hostname;
    const proto = window.location.protocol || 'http:';
    const pageNotLoop = h !== 'localhost' && h !== '127.0.0.1';
    if (pageNotLoop) {
      const p = window.location.port;
      const tryPorts =
        !p || p === '80' || p === '443' || (p !== '3001' && p !== '3000') ? ['3001', '3000'] : [];
      for (const port of tryPorts) {
        const tryOrigin = `${proto}//${h}:${port}`;
        const tryBase = normalizeApiBaseUrl(`${tryOrigin}/api`);
        if (await isPrismaAdminApi(tryBase)) {
          _apiBase = tryBase;
          try {
            localStorage.setItem(LS_API_ORIGIN, tryOrigin);
          } catch {
            /* ignore */
          }
          return;
        }
      }
    }
  }

  const pageH = typeof window !== 'undefined' ? window.location?.hostname || '' : '';
  const pageIsLoopback =
    pageH === 'localhost' || pageH === '127.0.0.1' || window.location?.protocol === 'file:';
  if (pageIsLoopback) {
    for (const port of [3001, 3000]) {
      const base = normalizeApiBaseUrl(`http://127.0.0.1:${port}/api`);
      if (await isPrismaAdminApi(base)) {
        _apiBase = base;
        try {
          localStorage.setItem(LS_API_ORIGIN, `http://127.0.0.1:${port}`);
        } catch {
          /* ignore */
        }
        return;
      }
    }
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const h = window.location.hostname;
    if (h !== 'localhost' && h !== '127.0.0.1') {
      const proto = window.location.protocol || 'http:';
      _apiBase = normalizeApiBaseUrl(`${proto}//${h}:3001/api`);
      return;
    }
  }
  _apiBase = normalizeApiBaseUrl('http://127.0.0.1:3001/api');
}

export function resolveApiBase() {
  if (_apiBase) return normalizeApiBaseUrl(_apiBase);
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem(LS_API_ORIGIN);
    if (custom) {
      const norm = normalizeLoopbackApiOrigin(normalizeStoredApiOrigin(custom));
      if (storedLoopbackMismatchLanPage(norm)) {
        try {
          localStorage.removeItem(LS_API_ORIGIN);
        } catch {
          /* ignore */
        }
      } else {
        return normalizeApiBaseUrl(`${norm}/api`);
      }
    }
    if (window.location?.origin && window.location.protocol !== 'file:') {
      return normalizeApiBaseUrl(`${window.location.origin}/api`);
    }
    const h = window.location?.hostname;
    if (h && h !== 'localhost' && h !== '127.0.0.1') {
      const proto = window.location.protocol || 'http:';
      return normalizeApiBaseUrl(`${proto}//${h}:3001/api`);
    }
  }
  return normalizeApiBaseUrl('http://127.0.0.1:3001/api');
}

/**
 * Quando o browser não alcança a API (backend parado, origem errada, rede).
 * @param {string} method
 * @param {string} path
 * @param {unknown} err
 */
function adminApiUnreachableMessage(method, path, err) {
  const base = resolveApiBase();
  const raw = String(err && (err.message || err)).toLowerCase();
  const looksNetwork =
    (err && err.name === 'TypeError') ||
    /failed to fetch|networkerror|load failed|fetch failed|network request failed/.test(raw);
  if (looksNetwork) {
    return (
      `Não foi possível contactar a API em ${base} (${method} ${path}). ` +
      'Inicie o backend (pasta admin-panel/backend: npm run dev, porta 3001). ' +
      'Se o painel abrir noutro host/porta, defina no navegador localStorage a chave "brspark_admin_api_origin" ' +
      'com a origem do servidor (ex.: http://127.0.0.1:3001), sem /api no fim.'
    );
  }
  return String((err && err.message) || err || 'Erro de rede.');
}

export const CONFIG = {
  get API_BASE() {
    return resolveApiBase();
  },

  /** Returns stored JWT token (repõe a partir do bundle se este separador ainda não tiver sessão). */
  getToken: () => {
    restoreAdminSessionBundleIfNeeded();
    return sessionStorage.getItem('brspark_admin_token') || '';
  },

  /** Common headers for all fetch requests */
  headers: () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONFIG.getToken()}`,
  }),

  /** Convenience fetch wrapper */
  async get(path) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE}${path}`, { headers: CONFIG.headers() });
    } catch (err) {
      console.error('[CONFIG.get]', path, err);
      return null;
    }
    if (res.status === 401) {
      clearAdminSessionFully();
      window.location.href = 'index.html';
      return null;
    }
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch {
      console.error('[CONFIG.get] Resposta não é JSON — verifique se admin-panel/backend está no ar (PostgreSQL).', path);
      return { error: 'invalid_response', _raw: raw.slice(0, 120) };
    }
  },

  async post(path, body) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE}${path}`, {
        method: 'POST',
        headers: CONFIG.headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('[CONFIG.post]', path, err);
      const msg = adminApiUnreachableMessage('POST', path, err);
      return { ok: false, error: msg, message: msg };
    }
    if (res.status === 401) {
      clearAdminSessionFully();
      window.location.href = 'index.html';
      return null;
    }
    const raw = await res.text();
    try {
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok && data && typeof data === 'object' && !data.error) {
        data.error = `Pedido falhou (HTTP ${res.status}).`;
      }
      return data;
    } catch {
      console.error('[CONFIG.post] Resposta não é JSON', path, res.status, raw?.slice?.(0, 200));
      return { error: `Resposta inválida do servidor (HTTP ${res.status}).` };
    }
  },

  async patch(path, body) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE}${path}`, {
        method: 'PATCH',
        headers: CONFIG.headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('[CONFIG.patch]', path, err);
      const msg = adminApiUnreachableMessage('PATCH', path, err);
      return { ok: false, error: msg, message: msg };
    }
    if (res.status === 401) {
      clearAdminSessionFully();
      window.location.href = 'index.html';
      return null;
    }
    const raw = await res.text();
    try {
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok && data && typeof data === 'object' && !data.error) {
        data.error = `Pedido falhou (HTTP ${res.status}).`;
      }
      return data;
    } catch {
      console.error('[CONFIG.patch] Resposta não é JSON', path, res.status, raw?.slice?.(0, 200));
      return { error: `Resposta inválida do servidor (HTTP ${res.status}).` };
    }
  },

  async put(path, body) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE}${path}`, {
        method: 'PUT',
        headers: CONFIG.headers(),
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('[CONFIG.put]', path, err);
      const msg = adminApiUnreachableMessage('PUT', path, err);
      return { ok: false, error: msg, message: msg };
    }
    if (res.status === 401) {
      clearAdminSessionFully();
      window.location.href = 'index.html';
      return null;
    }
    const raw = await res.text();
    try {
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok && data && typeof data === 'object' && !data.error) {
        data.error = `Pedido falhou (HTTP ${res.status}).`;
      }
      return data;
    } catch {
      console.error('[CONFIG.put] Resposta não é JSON', path, res.status, raw?.slice?.(0, 200));
      return { error: `Resposta inválida do servidor (HTTP ${res.status}).` };
    }
  },

  async del(path) {
    let res;
    try {
      res = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'DELETE', headers: CONFIG.headers() });
    } catch (err) {
      console.error('[CONFIG.del]', path, err);
      const msg = adminApiUnreachableMessage('DELETE', path, err);
      return { ok: false, error: msg, message: msg };
    }
    if (res.status === 401) {
      clearAdminSessionFully();
      window.location.href = 'index.html';
      return null;
    }
    const raw = await res.text();
    try {
      const data = raw ? JSON.parse(raw) : {};
      if (!res.ok && data && typeof data === 'object' && !data.error) {
        data.error = `Pedido falhou (HTTP ${res.status}).`;
      }
      return data;
    } catch {
      console.error('[CONFIG.del] Resposta não é JSON', path, res.status, raw?.slice?.(0, 200));
      return { error: `Resposta inválida do servidor (HTTP ${res.status}).` };
    }
  },
};
