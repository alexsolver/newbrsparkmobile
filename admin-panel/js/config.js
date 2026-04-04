/**
 * config.js — Frontend API configuration
 * Quando o painel é aberto via servidor admin (ex.: http://localhost:3001/),
 * usa a mesma origem — assim todas as chamadas batem no backend Prisma + PostgreSQL.
 * Fallback: http://localhost:3001/api (dev com arquivo aberto direto ou outra porta).
 */
export function resolveApiBase() {
  if (typeof window !== 'undefined' && window.location?.origin && window.location.protocol !== 'file:') {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:3001/api';
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
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'POST', headers: CONFIG.headers(), body: JSON.stringify(body) });
    return res.json();
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
