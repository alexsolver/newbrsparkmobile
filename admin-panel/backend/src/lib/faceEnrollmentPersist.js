'use strict';

const fs = require('fs').promises;
const path = require('path');
const { syncComprefaceGalleryAfterUserChange } = require('./comprefaceGallerySyncTrigger');
const { isRegistrationPrimaryFacePhoto } = require('./faceEnrollmentPrimary');
const { auditActor } = require('./auditActor');

const MAX_FACE_ENROLLMENT_PHOTOS = 12;
const MAX_FACE_ENROLLMENT_BYTES = 5 * 1024 * 1024;

function normalizeFacePhotos(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((p) => p && typeof p === 'object' && p.id && p.url);
  return [];
}

function sortFaceEnrollmentPrimaryFirst(arr) {
  const list = normalizeFacePhotos(arr);
  const prim = list.filter(isRegistrationPrimaryFacePhoto);
  const rest = list.filter((p) => !isRegistrationPrimaryFacePhoto(p));
  return [...prim, ...rest];
}

function mimeToFaceExt(mt) {
  const m = String(mt || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return null;
}

function detectFaceExtFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  const head = buf.slice(0, 12);
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf.length >= 12 && buf.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.slice(8, 12).toString('ascii').toLowerCase();
    if (brand.includes('heic') || brand.includes('heix') || brand === 'mif1' || brand === 'msf1') return 'heic';
  }
  return null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   userId: string,
 *   tenantId: string,
 *   resourceEmail: string,
 *   fileBase64: string,
 *   mimeType?: string|null,
 *   req: import('express').Request,
 *   auditAction: string,
 *   auditCategory: 'ADMIN'|'AUTH',
 *   syncReason: string,
 * }} opts
 */
async function appendUserFaceEnrollmentPhoto(prisma, opts) {
  const {
    userId,
    tenantId,
    resourceEmail,
    fileBase64,
    mimeType,
    req,
    auditAction,
    auditCategory,
    syncReason,
  } = opts;
  const b64 = String(fileBase64 || '').replace(/\s/g, '');
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, status: 400, error: 'Base64 inválido.' };
  }
  if (buf.length > MAX_FACE_ENROLLMENT_BYTES) {
    return { ok: false, status: 400, error: 'Imagem muito grande (máx. 5 MB).' };
  }
  if (buf.length < 64) return { ok: false, status: 400, error: 'Arquivo inválido.' };

  let ext = mimeToFaceExt(mimeType);
  if (!ext) ext = detectFaceExtFromBuffer(buf);
  if (ext === 'heic') {
    return {
      ok: false,
      status: 400,
      error:
        'HEIC/HEIF não é suportado. No iPhone: Ajustes → Câmera → Formatos → «Mais compatível», ou exporte a foto como JPEG antes de enviar.',
    };
  }
  if (!ext) return { ok: false, status: 400, error: 'Use imagem JPEG, PNG ou WebP.' };

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { faceEnrollmentPhotos: true },
  });
  if (!user) return { ok: false, status: 404, error: 'Usuário não encontrado.' };

  const list = normalizeFacePhotos(user.faceEnrollmentPhotos);
  if (list.length >= MAX_FACE_ENROLLMENT_PHOTOS) {
    return { ok: false, status: 400, error: `Limite de ${MAX_FACE_ENROLLMENT_PHOTOS} fotos base atingido.` };
  }

  const photoId = `fe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const fname = `${photoId}.${ext}`;
  const absDir = path.join(__dirname, '../../public/uploads/face-enrollment', userId);
  await fs.mkdir(absDir, { recursive: true });
  await fs.writeFile(path.join(absDir, fname), buf);

  const publicPath = `/uploads/face-enrollment/${userId}/${fname}`;
  const createdAt = new Date().toISOString();
  const entry = {
    id: photoId,
    url: publicPath,
    mimeType: mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    createdAt,
  };
  const next = sortFaceEnrollmentPrimaryFirst([...list, entry]);

  await prisma.user.update({
    where: { id: userId },
    data: { faceEnrollmentPhotos: next },
  });

  await prisma.auditLog
    .create({
      data: {
        ...auditActor(req),
        tenantId,
        action: auditAction,
        resource: resourceEmail,
        category: auditCategory,
        metadata: { userId, photoId },
      },
    })
    .catch(() => {});

  const { comprefaceSync, comprefaceRecognitionSync } = await syncComprefaceGalleryAfterUserChange(
    prisma,
    userId,
    req,
    syncReason,
  );

  return { ok: true, status: 201, photo: entry, photos: next, comprefaceSync, comprefaceRecognitionSync };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{
 *   userId: string,
 *   tenantId: string,
 *   resourceEmail: string,
 *   photoId: string,
 *   req: import('express').Request,
 *   auditAction: string,
 *   auditCategory: 'ADMIN'|'AUTH',
 *   syncReason: string,
 * }} opts
 */
async function removeUserFaceEnrollmentPhoto(prisma, opts) {
  const { userId, tenantId, resourceEmail, photoId, req, auditAction, auditCategory, syncReason } = opts;
  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: { faceEnrollmentPhotos: true },
  });
  if (!user) return { ok: false, status: 404, error: 'Usuário não encontrado.' };
  const list = normalizeFacePhotos(user.faceEnrollmentPhotos);
  const found = list.find((p) => p.id === photoId);
  if (!found) return { ok: false, status: 404, error: 'Foto não encontrada.' };
  if (isRegistrationPrimaryFacePhoto(found)) {
    return {
      ok: false,
      status: 400,
      error:
        'Esta foto é a do passo 1 do cadastro do prestador (referência principal) e não pode ser removida aqui. Ela só é substituída se o cadastro for refeito e aprovado de novo, ou se o usuário for excluído.',
    };
  }

  const next = sortFaceEnrollmentPrimaryFirst(list.filter((p) => p.id !== photoId));

  if (found.url && typeof found.url === 'string' && found.url.startsWith('/uploads/face-enrollment/')) {
    const rel = found.url.replace(/^\/uploads\//, '');
    const abs = path.join(__dirname, '../../public/uploads', ...rel.split('/'));
    try {
      await fs.unlink(abs);
    } catch {
      /* arquivo já ausente */
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { faceEnrollmentPhotos: next },
  });

  await prisma.auditLog
    .create({
      data: {
        ...auditActor(req),
        tenantId,
        action: auditAction,
        resource: resourceEmail,
        category: auditCategory,
        metadata: { userId, photoId },
      },
    })
    .catch(() => {});

  const { comprefaceSync, comprefaceRecognitionSync } = await syncComprefaceGalleryAfterUserChange(
    prisma,
    userId,
    req,
    syncReason,
  );

  return { ok: true, status: 200, photos: next, comprefaceSync, comprefaceRecognitionSync };
}

function decodeFaceEnrollmentBase64(fileBase64, mimeType) {
  const b64 = String(fileBase64 || '').replace(/\s/g, '');
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, error: 'Base64 inválido.' };
  }
  if (buf.length > MAX_FACE_ENROLLMENT_BYTES) {
    return { ok: false, error: 'Imagem muito grande (máx. 5 MB).' };
  }
  if (buf.length < 64) return { ok: false, error: 'Arquivo inválido.' };
  let ext = mimeToFaceExt(mimeType);
  if (!ext) ext = detectFaceExtFromBuffer(buf);
  if (ext === 'heic') {
    return {
      ok: false,
      error:
        'HEIC não é suportado. No iPhone use formatos compatíveis (JPEG) ou exporte a foto antes de enviar.',
    };
  }
  if (!ext) return { ok: false, error: 'Use imagem JPEG, PNG ou WebP.' };
  return { ok: true, buf, ext };
}

module.exports = {
  MAX_FACE_ENROLLMENT_PHOTOS,
  MAX_FACE_ENROLLMENT_BYTES,
  normalizeFacePhotos,
  sortFaceEnrollmentPrimaryFirst,
  mimeToFaceExt,
  detectFaceExtFromBuffer,
  appendUserFaceEnrollmentPhoto,
  removeUserFaceEnrollmentPhoto,
  decodeFaceEnrollmentBase64,
};
