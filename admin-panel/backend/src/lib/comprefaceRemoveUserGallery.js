'use strict';

const {
  buildComprefaceApiRoots,
  comprefaceSubjectName,
  deleteFacesForSubject,
  deleteStaleAriaSubjectFacesForUser,
} = require('./comprefaceClient');
const { findActiveComprefaceForTenant } = require('./comprefaceSync');

/**
 * Remove todas as faces do subject Aria `homeTenantId:userId` no FaceMatch (Recognition)
 * e subjects obsoletos `outroTenantId:userId` para o mesmo utilizador.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} homeTenantId — `User.tenantId` (prefixo do subject no FaceMatch)
 * @param {string} userId
 * @param {{ updateUserRow?: boolean, reason?: string }} [opts] — `updateUserRow` (default true): grava `comprefaceRecognitionSync` como purgado; false para eliminação de `User` em curso.
 * @returns {Promise<{ ok: boolean, subject?: string, error?: string, rootsTried?: number }>}
 */
async function removeComprefaceGalleryForUser(prisma, homeTenantId, userId, opts = {}) {
  const updateUserRow = opts && opts.updateUserRow === false ? false : true;
  const tid = String(homeTenantId || '').trim();
  const uid = String(userId || '').trim();
  if (!tid || !uid) return { ok: false, error: 'tenantId ou userId em falta.' };

  const integration = await findActiveComprefaceForTenant(prisma, tid);
  if (!integration?.apiKey) {
    return { ok: false, error: 'Sem integração FaceMatch ativa para esta tenant.' };
  }

  const apiKey = String(integration.apiKey).trim();
  const subject = comprefaceSubjectName(tid, uid);
  const roots = buildComprefaceApiRoots(integration.baseUrl, integration.description);
  if (!roots.length) {
    return { ok: false, error: 'URL FaceMatch não configurada.', subject };
  }

  let lastErr = '';
  let rootsTried = 0;
  for (const root of roots) {
    rootsTried += 1;
    try {
      await deleteFacesForSubject(root, apiKey, subject);
      await deleteStaleAriaSubjectFacesForUser(root, apiKey, tid, uid);
      if (updateUserRow) {
        const msg = String(opts.reason || 'Faces removidas no FaceMatch.').slice(0, 240);
        try {
          await prisma.user.update({
            where: { id: uid },
            data: {
              comprefaceRecognitionSync: {
                status: 'purged',
                at: new Date().toISOString(),
                message: msg,
              },
            },
          });
        } catch (_) {
          /* utilizador já apagado ou RLS — ignorar */
        }
      }
      return { ok: true, subject, rootsTried };
    } catch (e) {
      lastErr = e.message || String(e);
    }
  }
  return { ok: false, error: lastErr || 'Falha ao contactar FaceMatch.', subject, rootsTried };
}

module.exports = { removeComprefaceGalleryForUser };
