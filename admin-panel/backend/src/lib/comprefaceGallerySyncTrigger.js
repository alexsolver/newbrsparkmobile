'use strict';

const { syncUserToCompreface } = require('./comprefaceSync');
const { persistComprefaceRecognitionSync } = require('./comprefaceRecognitionPersist');
const { auditActor } = require('./auditActor');
const { removeComprefaceGalleryForUser } = require('./comprefaceRemoveUserGallery');

/**
 * Envia avatar + fotos de matrícula ao FaceMatch e persiste `comprefaceRecognitionSync`.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @param {import('express').Request|null} req — se null, não grava auditoria `USER_COMPREFACE_SYNC`
 * @param {string} [trigger='gallery_change']
 * @returns {Promise<{ comprefaceSync: object, comprefaceRecognitionSync: object|null }>}
 */
async function syncComprefaceGalleryAfterUserChange(prisma, userId, req, trigger) {
  let comprefaceSync = null;
  let syncResult = null;
  try {
    const r = await syncUserToCompreface(prisma, userId);
    syncResult = r;
    comprefaceSync = r.ok
      ? { ok: true, subject: r.subject, faces: r.faces }
      : { ok: false, error: r.error || 'Falha na sincronização.' };
    await persistComprefaceRecognitionSync(prisma, userId, r);
    if (r.ok && req) {
      const row = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, tenantId: true },
      });
      if (row) {
        await prisma.auditLog
          .create({
            data: {
              ...auditActor(req),
              tenantId: row.tenantId,
              action: 'USER_COMPREFACE_SYNC',
              resource: row.email,
              category: 'ADMIN',
              metadata: {
                userId,
                subject: r.subject,
                faces: r.faces,
                trigger: String(trigger || 'gallery_change'),
                ...(r.orphanSubjectsCleaned ? { orphanSubjectsCleaned: r.orphanSubjectsCleaned } : {}),
              },
            },
          })
          .catch(() => {});
      }
    }
  } catch (e) {
    comprefaceSync = { ok: false, error: e.message || String(e) };
    await persistComprefaceRecognitionSync(prisma, userId, { ok: false, error: comprefaceSync.error });
  }
  const rowCf = await prisma.user.findUnique({
    where: { id: userId },
    select: { comprefaceRecognitionSync: true },
  });
  return { comprefaceSync, comprefaceRecognitionSync: rowCf?.comprefaceRecognitionSync, syncResult };
}

module.exports = { syncComprefaceGalleryAfterUserChange, removeComprefaceGalleryForUser };
