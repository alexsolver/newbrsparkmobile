/**
 * config.js — Frontend API configuration
 * O painel precisa da API Prisma + PostgreSQL (pasta admin-panel/backend).
 * A API oficial é admin-panel/backend (PostgreSQL). A pasta backend/ só repassa npm start → mesma API.
 */
const LS_API_ORIGIN = 'brspark_admin_api_origin';

/** Cópia da sessão do painel (JWT + metadados) — compartilhada entre abas; limpa no logout e em 401. */
const LS_ADMIN_SESSION_BUNDLE = 'brspark_admin_session_bundle';
const SS_ADMIN_CONTEXT = 'brspark_admin_context';
const SS_ADMIN_CAPABILITIES = 'brspark_admin_capabilities';

/**
 * Grava no `localStorage` o mesmo conteúdo relevante do `sessionStorage` (login válido).
 * Permite abrir `operations.html` / PDF em outra aba sem perder o Bearer.
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
      panelTenantListKind: sessionStorage.getItem('brspark_panel_tenant_list_kind') || '',
      adminContext: sessionStorage.getItem(SS_ADMIN_CONTEXT) || '',
      adminCapabilities: sessionStorage.getItem(SS_ADMIN_CAPABILITIES) || '',
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
    if (b.panelTenantListKind != null && String(b.panelTenantListKind).trim() !== '') {
      // Lista do seletor de plataforma é só tenants empresa; ignora valores antigos (ALL / CLIENT / …).
      sessionStorage.setItem('brspark_panel_tenant_list_kind', 'COMPANY');
    }
    if (b.adminContext != null && String(b.adminContext).trim() !== '') {
      sessionStorage.setItem(SS_ADMIN_CONTEXT, String(b.adminContext));
    }
    if (b.adminCapabilities != null && String(b.adminCapabilities).trim() !== '') {
      sessionStorage.setItem(SS_ADMIN_CAPABILITIES, String(b.adminCapabilities));
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

export function applyPanelSessionBootstrap(payload) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  const context = payload?.context && typeof payload.context === 'object' ? payload.context : null;
  const capabilities = Array.isArray(payload?.capabilities) ? payload.capabilities : [];
  if (context) {
    sessionStorage.setItem(SS_ADMIN_CONTEXT, JSON.stringify(context));
  } else {
    sessionStorage.removeItem(SS_ADMIN_CONTEXT);
  }
  if (capabilities.length) {
    sessionStorage.setItem(SS_ADMIN_CAPABILITIES, JSON.stringify(capabilities));
  } else {
    sessionStorage.removeItem(SS_ADMIN_CAPABILITIES);
  }
}

export function getPanelContext() {
  try {
    const raw = sessionStorage.getItem(SS_ADMIN_CONTEXT);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPanelCapabilities() {
  try {
    const raw = sessionStorage.getItem(SS_ADMIN_CAPABILITIES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Capabilities do painel + inferência mínima quando `brspark_admin_capabilities` falta no sessionStorage
 * (ex.: nova aba via `opener`, bundle antigo): Admin legado (`panel:false`+`id`) e SaaS admin (`panel:true`+`role=SAAS_ADMIN`).
 * O servidor continua a ser a fonte de verdade; isto evita UI sem permissões aparentes.
 */
export function getEffectivePanelCapabilities() {
  const base = getPanelCapabilities();
  const extra = [];
  try {
    const token = sessionStorage.getItem('brspark_admin_token');
    if (!token) return base;
    const parts = token.split('.');
    if (parts.length < 2) return base;
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const payload = JSON.parse(atob(b64));
    if (payload && payload.panel === false && payload.id) {
      extra.push(
        'platform.access',
        'platform.dashboard.read',
        'platform.tenants.read',
        'platform.tenants.write',
        'platform.users.read',
        'platform.users.write',
        /** Convites prestador / utilizadores em qualquer tenant (painel usa tenant.users.* em várias páginas). */
        'tenant.users.write.any',
        'tenant.branding.read.any',
        'tenant.branding.write.any'
      );
    } else if (payload && payload.panel === true) {
      const role = String(payload.role || '').trim().toUpperCase();
      if (role === 'SAAS_ADMIN') {
        extra.push(
          'platform.access',
          'platform.dashboard.read',
          'platform.tenants.read',
          'platform.tenants.write',
          'platform.users.read',
          'platform.users.write',
          'tenant.users.write.any',
          'tenant.branding.read.any',
          'tenant.branding.write.any'
        );
      }
    }
  } catch {
    /* JWT inválido / parse */
  }
  return [...new Set([...base, ...extra])];
}

export async function refreshPanelSessionBootstrap() {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  const token = sessionStorage.getItem('brspark_admin_token');
  if (!token) return null;
  try {
    const res = await fetch(`${resolveApiBase()}/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 401) {
      clearAdminSessionFully();
      window.location.href = 'index.html';
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.user) {
      sessionStorage.setItem('brspark_admin_email', data.user.email || '');
      sessionStorage.setItem('brspark_admin_name', data.user.name || '');
      sessionStorage.setItem('brspark_admin_role', data.user.role || '');
    } else if (data?.admin) {
      sessionStorage.setItem('brspark_admin_email', data.admin.email || '');
      sessionStorage.setItem('brspark_admin_name', data.admin.name || '');
      sessionStorage.setItem('brspark_admin_role', '');
    }
    if (data?.tenant && data.tenant.id) {
      sessionStorage.setItem('brspark_panel_mode', 'tenant');
      sessionStorage.setItem('brspark_panel_tenant', JSON.stringify(data.tenant));
    } else if (data?.mode === 'global') {
      sessionStorage.setItem('brspark_panel_mode', 'global');
      sessionStorage.removeItem('brspark_panel_tenant');
    }
    applyPanelSessionBootstrap(data);
    persistAdminSessionBundleFromSessionStorage();
    return data;
  } catch {
    return null;
  }
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
 * Origem gravada no PC (127.0.0.1/localhost) é inútil no celular/tablet na LAN:
 * aí `localhost` é o próprio dispositivo. Ignorar e voltar a detectar pela página.
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

/** Timeout curto: várias sondas em sequência bloqueavam o `await` do login/init antes dos listeners de clique. */
const ADMIN_API_PROBE_MS = 3200;

/** GET /api/plans sem token → API Prisma responde 401 JSON. */
async function isPrismaAdminApi(baseUrl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ADMIN_API_PROBE_MS);
  try {
    const r = await fetch(`${baseUrl}/plans`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    const ct = (r.headers.get('content-type') || '').includes('application/json');
    return ct && (r.status === 401 || r.status === 403 || r.status === 200);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Primeira base que responder como API admin; sondas em paralelo (só até o timeout da mais lenta). */
async function firstMatchingApiBase(candidates) {
  const bases = [];
  const seen = new Set();
  for (const c of candidates || []) {
    const b = normalizeApiBaseUrl(c);
    if (!b || seen.has(b)) continue;
    seen.add(b);
    bases.push(b);
  }
  if (!bases.length) return null;
  const hits = await Promise.all(bases.map(async (base) => ((await isPrismaAdminApi(base)) ? base : null)));
  return hits.find(Boolean) || null;
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
      const tryBase = normalizeApiBaseUrl(`${origin}/api`);
      if (await isPrismaAdminApi(tryBase)) {
        _apiBase = tryBase;
        return;
      }
      try {
        localStorage.removeItem(LS_API_ORIGIN);
      } catch {
        /* ignore */
      }
      /* origem salva inválida ou API fora do ar — continua a deteção abaixo */
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
      const lanBases = tryPorts.map((port) => normalizeApiBaseUrl(`${proto}//${h}:${port}/api`));
      const hitLan = await firstMatchingApiBase(lanBases);
      if (hitLan) {
        _apiBase = hitLan;
        try {
          localStorage.setItem(LS_API_ORIGIN, new URL(hitLan).origin);
        } catch {
          /* ignore */
        }
        return;
      }
    }
  }

  const pageH = typeof window !== 'undefined' ? window.location?.hostname || '' : '';
  const pageIsLoopback =
    pageH === 'localhost' || pageH === '127.0.0.1' || window.location?.protocol === 'file:';
  if (pageIsLoopback) {
    const loopBases = [3001, 3000].map((port) => normalizeApiBaseUrl(`http://127.0.0.1:${port}/api`));
    const hitLoop = await firstMatchingApiBase(loopBases);
    if (hitLoop) {
      _apiBase = hitLoop;
      try {
        localStorage.setItem(LS_API_ORIGIN, new URL(hitLoop).origin);
      } catch {
        /* ignore */
      }
      return;
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
      `Não foi possível contatar a API em ${base} (${method} ${path}). ` +
      'Inicie o backend (pasta admin-panel/backend: npm run dev, porta 3001). ' +
      'Se o painel abrir em outro host/porta, defina no navegador localStorage a chave "brspark_admin_api_origin" ' +
      'com a origem do servidor (ex.: http://127.0.0.1:3001), sem /api no final.'
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
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(55000)
          : undefined;
      res = await fetch(`${CONFIG.API_BASE}${path}`, {
        method: 'POST',
        headers: CONFIG.headers(),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      console.error('[CONFIG.post]', path, err);
      if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        return {
          ok: false,
          error:
            'O pedido demorou demais (timeout ~55s). Verifique se a API responde e a ligação de rede.',
          message: 'timeout',
        };
      }
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
      if (!res.ok && data && typeof data === 'object') {
        const fromApi =
          (typeof data.error === 'string' && data.error.trim()) ||
          (typeof data.message === 'string' && data.message.trim()) ||
          (typeof data.msg === 'string' && data.msg.trim()) ||
          '';
        data.error = fromApi || `Pedido falhou (HTTP ${res.status}).`;
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
      if (!res.ok && data && typeof data === 'object') {
        const fromApi =
          (typeof data.error === 'string' && data.error.trim()) ||
          (typeof data.message === 'string' && data.message.trim()) ||
          (typeof data.msg === 'string' && data.msg.trim()) ||
          '';
        data.error = fromApi || `Pedido falhou (HTTP ${res.status}).`;
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
      if (!res.ok && data && typeof data === 'object') {
        const fromApi =
          (typeof data.error === 'string' && data.error.trim()) ||
          (typeof data.message === 'string' && data.message.trim()) ||
          (typeof data.msg === 'string' && data.msg.trim()) ||
          '';
        data.error = fromApi || `Pedido falhou (HTTP ${res.status}).`;
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
