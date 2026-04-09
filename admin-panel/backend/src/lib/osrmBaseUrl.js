'use strict';

/** Fallback quando não há integração OSRM no painel */
const DEFAULT_OSRM_BASE = 'https://router.project-osrm.org';

/**
 * Garante URL base do servidor OSRM (sem path de serviço).
 * Se o usuário colar …/match/v1/driving ou …/route/v1/driving, remove o sufixo.
 */
function normalizeOsrmBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_OSRM_BASE;
  let u = raw.trim().replace(/\/+$/, '');
  const suffixes = [
    '/match/v1/driving',
    '/route/v1/driving',
    '/table/v1/driving',
    '/trip/v1/driving',
    '/nearest/v1/driving',
  ];
  for (const s of suffixes) {
    const L = s.length;
    if (u.length >= L && u.slice(-L).toLowerCase() === s.toLowerCase()) {
      u = u.slice(0, -L).replace(/\/+$/, '');
      break;
    }
  }
  return u || DEFAULT_OSRM_BASE;
}

module.exports = { normalizeOsrmBaseUrl, DEFAULT_OSRM_BASE };
