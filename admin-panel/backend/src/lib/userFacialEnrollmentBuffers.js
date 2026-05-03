'use strict';

const path = require('path');
const { fetchUrlBufferSsrfSafe, readFileUnderPublicRoot } = require('./safeServerSideMediaFetch');
const { isRegistrationPrimaryFacePhoto } = require('./faceEnrollmentPrimary');

/**
 * @param {string} ref — URL absoluta ou path /uploads/...
 * @param {string} publicRoot — pasta public do painel
 */
async function bufferFromPublicOrUrl(ref, publicRoot) {
  const s = String(ref || '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    return fetchUrlBufferSsrfSafe(s);
  }
  if (s.startsWith('/')) {
    const rootAbs = path.resolve(publicRoot);
    return readFileUnderPublicRoot(rootAbs, s);
  }
  return null;
}

/**
 * Buffers de referência facial (mesma ordem que `syncUserToCompreface`):
 * fotos primárias de matrícula → avatar → restantes.
 * @param {{ avatarUrl?: string|null, faceEnrollmentPhotos?: unknown }} user
 * @returns {Promise<Array<{ buf: Buffer, name: string }>>}
 */
async function loadUserFacialReferenceBuffersFromUser(user) {
  if (!user) return [];

  const publicRoot = path.join(__dirname, '../../public');
  const buffers = [];
  const urlsSeen = new Set();

  async function pushBufferFromUrl(sourceUrl, buf, fileName) {
    if (!buf || buf.length < 64) return;
    const key = String(sourceUrl || fileName || '').trim() || fileName;
    if (urlsSeen.has(key)) return;
    urlsSeen.add(key);
    buffers.push({ buf, name: fileName });
  }

  const list = Array.isArray(user.faceEnrollmentPhotos) ? user.faceEnrollmentPhotos : [];
  const primaryList = list.filter((p) => p && isRegistrationPrimaryFacePhoto(p));
  const restList = list.filter((p) => p && !isRegistrationPrimaryFacePhoto(p));

  for (const p of primaryList) {
    if (!p.url) continue;
    try {
      const b = await bufferFromPublicOrUrl(p.url, publicRoot);
      const ext = String(p.mimeType || '')
        .toLowerCase()
        .includes('png')
        ? 'png'
        : 'jpg';
      await pushBufferFromUrl(
        p.url,
        b,
        `${String(p.id || 'fe').replace(/[^\w.-]/g, '_')}.${ext}`
      );
    } catch (e) {
      console.warn('[userFacialEnrollmentBuffers] faceEnrollment primary', p.id, e.message);
    }
  }

  const av = String(user.avatarUrl || '').trim();
  if (av) {
    try {
      const b = await bufferFromPublicOrUrl(user.avatarUrl, publicRoot);
      await pushBufferFromUrl(av, b, 'avatar.jpg');
    } catch (e) {
      console.warn('[userFacialEnrollmentBuffers] avatarUrl', e.message);
    }
  }

  for (const p of restList) {
    if (!p || typeof p !== 'object' || !p.url) continue;
    try {
      const b = await bufferFromPublicOrUrl(p.url, publicRoot);
      const ext =
        String(p.mimeType || '')
          .toLowerCase()
          .includes('png')
          ? 'png'
          : 'jpg';
      await pushBufferFromUrl(
        p.url,
        b,
        `${String(p.id || 'fe').replace(/[^\w.-]/g, '_')}.${ext}`
      );
    } catch (e) {
      console.warn('[userFacialEnrollmentBuffers] faceEnrollment', p.id, e.message);
    }
  }

  return buffers;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
async function loadUserFacialReferenceBuffers(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true, faceEnrollmentPhotos: true },
  });
  return loadUserFacialReferenceBuffersFromUser(user);
}

module.exports = {
  bufferFromPublicOrUrl,
  loadUserFacialReferenceBuffers,
  loadUserFacialReferenceBuffersFromUser,
};
