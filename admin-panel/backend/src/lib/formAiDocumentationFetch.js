'use strict';

const pdfParse = require('pdf-parse');

const MAX_BYTES = 400_000;
/** Por PDF extraído com pdf-parse — documentos longos (ex.: gov.br). */
const MAX_CHARS_OUT = 34_000;
/** Texto combinado máximo quando várias URLs são carregadas para o Composer. */
const MAX_CHARS_COMBINED_REFERENCES = 40_000;

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

function bufferLooksLikePdf(buf) {
  if (!buf || buf.length < 5) return false;
  return buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

/**
 * @param {Buffer} buf
 * @returns {Promise<string>}
 */
async function extractPdfTextForCopilot(buf) {
  const parsed = await pdfParse(buf);
  return String(parsed.text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
 * @param {unknown} rawList
 * @param {number} [maxUrls]
 * @returns {string[]}
 */
function normalizeHttpsReferenceUrls(rawList, maxUrls = 5) {
  const out = [];
  const seen = new Set();
  const arr = Array.isArray(rawList) ? rawList : [];
  for (const raw of arr) {
    if (out.length >= maxUrls) break;
    const s = raw != null ? String(raw).trim() : '';
    if (!s || !s.startsWith('https://')) continue;
    let u;
    try {
      u = new URL(s);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:') continue;
    const key = u.href.split('#')[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s.slice(0, 2048));
  }
  return out;
}

/**
 * Obtém texto de uma página (HTTPS público) para contexto do Composer.
 * @param {string} rawUrl
 * @param {{ maxCharsOut?: number }} [opts]
 * @returns {Promise<{ ok: boolean, text: string, error: string | null, finalUrl?: string }>}
 */
async function fetchDocumentationForCopilot(rawUrl, opts = {}) {
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
    return { ok: false, text: '', error: 'A URL não pode incluir usuário e senha (credenciais embutidas).' };
  }
  if (isBlockedHostname(u.hostname)) {
    return { ok: false, text: '', error: 'Esse host não é permitido (rede interna ou localhost).' };
  }

  try {
    const pdfLikely = /\.pdf(\?|#|$)/i.test(trimmed);
    const res = await fetch(trimmed, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(pdfLikely ? 45_000 : 18_000),
      headers: {
        Accept:
          'application/pdf,text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.7',
        'User-Agent': 'Aria-Admin-CopilotDocFetch/1.1',
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
    const isPdf =
      ct.includes('application/pdf') || pdfLikely || bufferLooksLikePdf(buf);

    let body;
    if (isPdf) {
      try {
        body = await extractPdfTextForCopilot(buf);
      } catch (e) {
        const msg = e && e.message ? String(e.message) : String(e);
        return { ok: false, text: '', error: 'Falha ao extrair texto do PDF: ' + msg.slice(0, 200) };
      }
      if (!body || body.length < 80) {
        return {
          ok: false,
          text: '',
          error:
            'PDF sem texto seleccionável (pode ser só imagem). Anexe o ficheiro para análise com OCR ou use uma página HTML com o mesmo conteúdo.',
        };
      }
    } else {
      body = buf.toString('utf8');
      if (ct.includes('application/json') || /^\s*[\[{]/.test(body)) {
        try {
          body = JSON.stringify(JSON.parse(body), null, 2);
        } catch {
          body = htmlToPlainText(body);
        }
      } else {
        body = htmlToPlainText(body);
      }
    }
    const cap =
      typeof opts.maxCharsOut === 'number' && opts.maxCharsOut > 500
        ? Math.min(opts.maxCharsOut, MAX_CHARS_OUT)
        : MAX_CHARS_OUT;
    if (body.length > cap) {
      body = body.slice(0, cap) + '\n…[truncado pelo painel]';
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

/**
 * Carrega várias URLs (documentação, checklist público, norma, etc.), com teto global de caracteres.
 * @param {string[]} urls
 * @param {{ onProgress?: (i: number, n: number, url: string) => void }} [hook]
 * @returns {Promise<{ combinedText: string, items: { url: string, ok: boolean, chars: number, error: string | null, finalUrl?: string }[], warnings: string[] }>}
 */
async function fetchMultipleReferenceUrlsForCopilot(urls, hook) {
  const list = normalizeHttpsReferenceUrls(urls, 5);
  const items = [];
  const warnings = [];
  let combined = '';
  let remaining = MAX_CHARS_COMBINED_REFERENCES;

  const n = list.length;
  for (let i = 0; i < list.length; i++) {
    const url = list[i];
    try {
      hook?.(i + 1, n, url);
    } catch (_) {
      /* ignore */
    }
    const perCap = Math.max(2000, Math.floor(remaining / Math.max(1, n - i)));
    const r = await fetchDocumentationForCopilot(url, { maxCharsOut: perCap });
    const finalU = r.finalUrl || url;
    const header = `\n\n---\n## Fonte web (${i + 1}/${n})\nURL pedida: ${url}\nURL final: ${finalU}\n---\n`;
    let body = '';
    if (r.ok && r.text) {
      body = r.text;
      items.push({
        url,
        ok: true,
        chars: r.text.length,
        error: null,
        finalUrl: finalU,
      });
    } else {
      const err = r.error || 'Falha ao obter conteúdo.';
      body = '[Não foi possível ler o conteúdo: ' + err + ']';
      warnings.push(`${url}: ${err}`);
      items.push({
        url,
        ok: false,
        chars: 0,
        error: err,
        finalUrl: finalU,
      });
    }
    const piece = header + body;
    if (piece.length <= remaining) {
      combined += piece;
      remaining -= piece.length;
    } else {
      combined += piece.slice(0, remaining) + '\n…[truncado — limite global de referências]';
      remaining = 0;
      break;
    }
  }

  return {
    combinedText: combined.trim(),
    items,
    warnings,
  };
}

module.exports = {
  fetchDocumentationForCopilot,
  normalizeHttpsReferenceUrls,
  fetchMultipleReferenceUrlsForCopilot,
  MAX_CHARS_COMBINED_REFERENCES,
};
