import { apiFetch, API_BASE } from './auth';

/** Garante URL absoluta (em dev o servidor pode devolver só o path). */
export function absoluteOccupancyFeedUrl(raw: string): string {
  const r = (raw || '').trim();
  if (!r) return '';
  if (/^https?:\/\//i.test(r)) return r;
  const base = API_BASE.replace(/\/$/, '');
  return `${base}${r.startsWith('/') ? r : `/${r}`}`;
}

export async function ensureAssetOccupancyCalendarFeed(
  assetId: string,
  rotate?: boolean
): Promise<{ url: string; token: string; calName?: string }> {
  const res = await apiFetch('/api/asset-occupancy-calendar/ensure', {
    method: 'POST',
    body: JSON.stringify({ assetId, rotate: !!rotate }),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; url?: string; token?: string; calName?: string };
  if (!res.ok) {
    throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`);
  }
  return {
    url: absoluteOccupancyFeedUrl(String(j.url || '')),
    token: String(j.token || ''),
    calName: j.calName,
  };
}
