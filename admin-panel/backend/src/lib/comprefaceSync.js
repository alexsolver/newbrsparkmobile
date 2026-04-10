'use strict';
const fs = require('fs').promises;
const path = require('path');
const {
  buildComprefaceApiRoots,
  comprefaceSubjectName,
  ensureSubject,
  deleteFacesForSubject,
  deleteStaleBrsparkSubjectFacesForUser,
  addFaceToSubject,
} = require('./comprefaceClient');

function parseVisionMeta(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function findActiveCompreface(prisma) {
  return prisma.integration.findFirst({
    where: { name: 'Exadel CompreFace', status: 'ACTIVE' },
  });
}

/**
 * @param {string} ref — URL absoluta ou path /uploads/...
 * @param {string} publicRoot — pasta public do painel
 */
async function bufferFromPublicOrUrl(ref, publicRoot) {
  const s = String(ref || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    const r = await fetch(s, { signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error(`Download HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  if (s.startsWith('/')) {
    const rel = s.replace(/^\//, '');
    const abs = path.join(publicRoot, rel);
    return fs.readFile(abs);
  }
  return null;
}

/**
 * Cria/atualiza subject no CompreFace e envia avatar + fotos de matrícula.
 * @returns {Promise<{ ok: boolean, subject?: string, faces?: number, root?: string, error?: string }>}
 */
async function syncUserToCompreface(prisma, userId) {
  const integration = await findActiveCompreface(prisma);
  if (!integration?.apiKey) {
    return { ok: false, error: 'Nenhuma integração Exadel CompreFace ativa com API Key.' };
  }
  const meta = parseVisionMeta(integration.metadata);
  if (!meta || meta.category !== 'COMPUTER_VISION' || meta.engine !== 'compreface') {
    return { ok: false, error: 'Integração CompreFace inválida ou inativa.' };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'Usuário não encontrado.' };

  const publicRoot = path.join(__dirname, '../../public');
  const buffers = [];

  if (user.avatarUrl) {
    try {
      const b = await bufferFromPublicOrUrl(user.avatarUrl, publicRoot);
      if (b && b.length >= 64) buffers.push({ buf: b, name: 'avatar.jpg' });
    } catch (e) {
      console.warn('[comprefaceSync] avatarUrl', e.message);
    }
  }

  const list = Array.isArray(user.faceEnrollmentPhotos) ? user.faceEnrollmentPhotos : [];
  for (const p of list) {
    if (!p || typeof p !== 'object' || !p.url) continue;
    try {
      const b = await bufferFromPublicOrUrl(p.url, publicRoot);
      const ext =
        String(p.mimeType || '')
          .toLowerCase()
          .includes('png')
          ? 'png'
          : 'jpg';
      if (b && b.length >= 64) buffers.push({ buf: b, name: `${String(p.id || 'fe').replace(/[^\w.-]/g, '_')}.${ext}` });
    } catch (e) {
      console.warn('[comprefaceSync] faceEnrollment', p.id, e.message);
    }
  }

  if (!buffers.length) {
    return { ok: false, error: 'Sem imagens válidas (avatar ou fotos de matrícula).' };
  }

  const subject = comprefaceSubjectName(user.tenantId, user.id);
  const roots = buildComprefaceApiRoots(integration.baseUrl, integration.description);
  const apiKey = String(integration.apiKey).trim();
  let lastErr = '';

  for (const root of roots) {
    try {
      const { cleaned: orphanSubjectsCleaned } = await deleteStaleBrsparkSubjectFacesForUser(
        root,
        apiKey,
        user.tenantId,
        user.id
      );
      await ensureSubject(root, apiKey, subject);
      await deleteFacesForSubject(root, apiKey, subject);
      for (const { buf, name } of buffers) {
        await addFaceToSubject(root, apiKey, subject, buf, name);
      }
      return {
        ok: true,
        subject,
        faces: buffers.length,
        root: String(root).replace(/\/+$/, ''),
        orphanSubjectsCleaned: orphanSubjectsCleaned || 0,
      };
    } catch (e) {
      lastErr = e.message || String(e);
    }
  }

  return { ok: false, error: lastErr || 'Falha ao contatar o CompreFace em todas as URLs tentadas.' };
}

module.exports = { syncUserToCompreface, findActiveCompreface };
