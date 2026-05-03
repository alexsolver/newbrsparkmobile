'use strict';

const dns = require('dns').promises;
const path = require('path');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  'metadata',
  'metadata.google.internal',
  '169.254.169.254',
]);

/**
 * @param {string} hostname
 * @returns {boolean}
 */
function isBlockedHostname(hostname) {
  const h = String(hostname || '').toLowerCase().trim();
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.localhost')) return true;
  return false;
}

/**
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateOrReservedIpv4(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return false;
  const n = parts.map((p) => Number(p));
  if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b] = n;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * @param {string} addr
 * @returns {boolean}
 */
function isUnsafeIpv6(addr) {
  const a = String(addr || '').toLowerCase();
  if (!a) return true;
  if (a === '::1') return true;
  if (a.startsWith('fe80:')) return true;
  if (a.startsWith('fc') || a.startsWith('fd')) return true;
  return false;
}

/**
 * Garante que o hostname não resolve para IP interno (mitigação SSRF em fetch server-side).
 * @param {string} hostname
 * @returns {Promise<void>}
 */
async function assertHostnameSafeForOutboundFetch(hostname) {
  if (isBlockedHostname(hostname)) {
    throw new Error('Host bloqueado para download server-side.');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    if (isPrivateOrReservedIpv4(hostname)) {
      throw new Error('IP privado bloqueado para download server-side.');
    }
    return;
  }

  let results;
  try {
    results = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    throw new Error(`DNS inválido: ${e && e.message ? e.message : String(e)}`);
  }
  if (!results || !results.length) {
    throw new Error('DNS sem resultados.');
  }
  for (const r of results) {
    if (r.family === 4) {
      if (isPrivateOrReservedIpv4(r.address)) {
        throw new Error('O host resolve para IP privado — download bloqueado.');
      }
    } else if (r.family === 6) {
      if (isUnsafeIpv6(r.address)) {
        throw new Error('O host resolve para IPv6 privado/link-local — download bloqueado.');
      }
    }
  }
}

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

/**
 * Fetch HTTP(S) com validação de host em cada hop (redirect manual).
 * @param {string} href
 * @returns {Promise<Buffer>}
 */
async function fetchUrlBufferSsrfSafe(href) {
  let url = String(href || '').trim();
  if (!url) throw new Error('URL vazia.');

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('URL inválida.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Apenas http(s) é permitido.');
    }
    if (parsed.username !== '' || parsed.password !== '') {
      throw new Error('URL com credenciais incorporadas não é permitida.');
    }
    await assertHostnameSafeForOutboundFetch(parsed.hostname);

    const res = await fetch(url, { signal: AbortSignal.timeout(45000), redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Resposta de redirect sem cabeçalho Location.');
      url = new URL(loc, parsed.href).href;
      continue;
    }
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    const len = res.headers.get('content-length');
    if (len != null && Number(len) > MAX_RESPONSE_BYTES) {
      throw new Error('Corpo da resposta excede o limite permitido.');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_RESPONSE_BYTES) {
      throw new Error('Corpo da resposta excede o limite permitido.');
    }
    return buf;
  }
  throw new Error('Demasiados redirects.');
}

/**
 * Lê ficheiro sob `publicRoot` sem path traversal.
 * @param {string} publicRootAbs — pasta public resolvida
 * @param {string} ref — caminho começado por / (ex. /uploads/foo.jpg)
 * @returns {Promise<Buffer|null>}
 */
async function readFileUnderPublicRoot(publicRootAbs, ref) {
  const s = String(ref || '').trim();
  if (!s.startsWith('/')) return null;
  const rel = s.replace(/^\/+/, '');
  if (!rel || rel.includes('..')) {
    throw new Error('Caminho inválido (path traversal).');
  }
  const root = path.resolve(publicRootAbs);
  const abs = path.resolve(root, rel);
  const relToRoot = path.relative(root, abs);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    throw new Error('Caminho fora da pasta public.');
  }
  const fs = require('fs').promises;
  return fs.readFile(abs);
}

module.exports = {
  fetchUrlBufferSsrfSafe,
  readFileUnderPublicRoot,
  assertHostnameSafeForOutboundFetch,
};
