'use strict';

/**
 * Reverse geocoding (Nominatim). Respeitar política de uso: User-Agent identificável.
 * @returns {Promise<string|null>}
 */
async function reverseGeocodeLatLng(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(la)}&lon=${encodeURIComponent(lo)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'AriaAdmin/1.0 (work-time; +https://aria.com)',
        Accept: 'application/json',
      },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data && (data.display_name || data.formatted_address);
    return addr ? String(addr).slice(0, 2000) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { reverseGeocodeLatLng };
