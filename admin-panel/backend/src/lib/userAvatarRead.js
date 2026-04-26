'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Lê bytes da imagem de avatar do utilizador (caminho local `/uploads/…` ou URL HTTP).
 * @param {string|null|undefined} avatarUrl
 * @returns {Promise<{ buf?: Buffer, error?: string }>}
 */
async function readUserAvatarImageBuffer(avatarUrl) {
  const u = String(avatarUrl || '').trim();
  if (!u) return { error: 'NO_AVATAR' };

  if (u.startsWith('/uploads/')) {
    const rel = u.replace(/^\/uploads\//, '');
    const abs = path.join(__dirname, '../../public/uploads', ...rel.split('/'));
    try {
      const buf = await fs.readFile(abs);
      if (!buf || buf.length < 64) return { error: 'READ_FAIL' };
      return { buf };
    } catch {
      return { error: 'READ_FAIL' };
    }
  }

  if (/^https?:\/\//i.test(u)) {
    try {
      const res = await fetch(u, {
        redirect: 'follow',
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(25_000) : undefined,
      });
      if (!res.ok) return { error: `HTTP_${res.status}` };
      const arr = Buffer.from(await res.arrayBuffer());
      if (!arr || arr.length < 64) return { error: 'EMPTY' };
      return { buf: arr };
    } catch (e) {
      return { error: String((e && e.message) || 'FETCH_FAIL') };
    }
  }

  return { error: 'UNSUPPORTED_URL' };
}

module.exports = { readUserAvatarImageBuffer };
