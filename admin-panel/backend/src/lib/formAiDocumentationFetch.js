'use strict';

const MAX_BYTES = 400_000;
const MAX_CHARS_OUT = 28_000;

/**
 * @param {string} hostname
 * @returns {boolean} true se o host não deve ser contactado (SSRF básico).
 */
function isBlockedHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]' || h === '::1') return true;
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const p = h.split('.').map(Number);
    const [a, b] = p;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|br|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Obtém texto de uma página de documentação (HTTPS público) para contexto do copiloto.
 * @param {string} rawUrl
 * @returns {Promise<{ ok: boolean, text: string, error: string | null, finalUrl?: string }>}
 */
async function fetchDocumentationForCopilot(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, text: '', error: null };
  }
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, text: '', error: 'URL inválida.' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, text: '', error: 'Só são permitidas URLs HTTPS (documentação pública).' };
  }
  if (u.username || u.password) {
    return { ok: false, text: '', error: 'A URL não pode incluir utilizador ou palavra-passe.' };
  }
  if (isBlockedHostname(u.hostname)) {
    return { ok: false, text: '', error: 'Esse host não é permitido (rede interna ou localhost).' };
  }

  try {
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
        'User-Agent': 'BrSpark-Admin-CopilotDocFetch/1.0',
      },
    });
    if (!res.ok) {
      return { ok: false, text: '', error: `O servidor devolveu HTTP ${res.status}.` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return { ok: false, text: '', error: 'Documentação demasiado grande (>400 KB).' };
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let body = buf.toString('utf8');
    if (ct.includes('application/json') || /^\s*[\[{]/.test(body)) {
      try {
        body = JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        body = htmlToPlainText(body);
      }
    } else {
      body = htmlToPlainText(body);
    }
    if (body.length > MAX_CHARS_OUT) {
      body = body.slice(0, MAX_CHARS_OUT) + '\n…[truncado pelo painel]';
    }
    return { ok: true, text: body, error: null, finalUrl: res.url || trimmed };
  } catch (e) {
    const name = e && e.name;
    const msg =
      name === 'AbortError' || name === 'TimeoutError'
        ? 'Tempo esgotado ao obter a documentação.'
        : e.message || String(e);
    return { ok: false, text: '', error: msg };
  }
}

module.exports = {
  fetchDocumentationForCopilot,
};
