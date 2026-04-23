/**
 * A API / painel podem gravar `avatarUrl` como caminho relativo (`/uploads/...`) ou com
 * `http://127.0.0.1:3001/...`. No app, `Image` precisa de URI absoluta; em dispositivo físico
 * loopback não é o Mac — usar a mesma origem que `API_BASE`.
 */
export function normalizeUserAvatarUrl(
  raw: string | null | undefined,
  apiBase: string
): string | undefined {
  const s = String(raw || '').trim();
  if (!s) return undefined;
  const base = String(apiBase || '').trim().replace(/\/+$/, '');
  if (!base) return s;

  if (s.startsWith('/') && !s.startsWith('//')) {
    return `${base}${s}`;
  }

  try {
    const u = new URL(/^\/\//i.test(s) ? `https:${s}` : s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return s;
    const h = u.hostname.toLowerCase();
    if (h === '127.0.0.1' || h === 'localhost' || h === '::1') {
      const b = new URL(base);
      return `${b.origin}${u.pathname}${u.search || ''}`;
    }
  } catch {
    return s;
  }
  return s;
}
