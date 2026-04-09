/**
 * config.js — Frontend API configuration
 * O painel precisa da API Prisma + PostgreSQL (pasta admin-panel/backend).
 * A API oficial é admin-panel/backend (PostgreSQL). A pasta backend/ só repassa npm start → mesma API.
 */
const LS_API_ORIGIN = 'brspark_admin_api_origin';

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

  if (window.location?.protocol !== 'file:' && window.location?.hostname) {
    const same = normalizeApiBaseUrl(`${window.location.origin}/api`);
    if (await isPrismaAdminApi(same)) {
      _apiBase = same;
      return;
    }
  }

  for (const port of [3001, 3000]) {
    const base = normalizeApiBaseUrl(`http://127.0.0.1:${port}/api`);
    if (await isPrismaAdminApi(base)) {
      _apiBase = base;
      localStorage.setItem(LS_API_ORIGIN, `http://127.0.0.1:${port}`);
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
      return normalizeApiBaseUrl(
        `${normalizeLoopbackApiOrigin(normalizeStoredApiOrigin(custom))}/api`
      );
    }
    if (window.location?.origin && window.location.protocol !== 'file:') {
      return normalizeApiBaseUrl(`${window.location.origin}/api`);
    }
  }
  return normalizeApiBaseUrl('http://127.0.0.1:3001/api');
}

export const CONFIG = {
  get API_BASE() {
    return resolveApiBase();
  },

  /** Returns stored JWT token */
  getToken: () => sessionStorage.getItem('brspark_admin_token') || '',

  /** Common headers for all fetch requests */
  headers: () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CONFIG.getToken()}`,
  }),

  /** Convenience fetch wrapper */
  async get(path) {
    const res = await fetch(`${CONFIG.API_BASE}${path}`, { headers: CONFIG.headers() });
    if (res.status === 401) { sessionStorage.clear(); window.location.href = 'index.html'; return null; }
    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch {
      console.error('[CONFIG.get] Resposta não é JSON — verifique se admin-panel/backend está no ar (PostgreSQL).', path);
      return { error: 'invalid_response', _raw: raw.slice(0, 120) };
    }
  },

  async post(path, body) {
    const res = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'POST', headers: CONFIG.headers(), body: JSON.stringify(body) });
    if (res.status === 401) {
      sessionStorage.clear();
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
    const res = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'PATCH', headers: CONFIG.headers(), body: JSON.stringify(body) });
    return res.json();
  },

  async put(path, body) {
    const res = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'PUT', headers: CONFIG.headers(), body: JSON.stringify(body) });
    return res.json();
  },

  async del(path) {
    const res = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'DELETE', headers: CONFIG.headers() });
    return res.json();
  },
};
