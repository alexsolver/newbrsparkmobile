/**
 * config.js — Frontend API configuration
 * All pages import this to get the API base URL.
 */
export const CONFIG = {
  API_BASE: 'http://localhost:3001/api',

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
