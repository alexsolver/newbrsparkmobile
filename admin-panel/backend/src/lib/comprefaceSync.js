'use strict';
const {
  buildComprefaceApiRoots,
  comprefaceSubjectName,
  ensureSubject,
  deleteFacesForSubject,
  deleteStaleAriaSubjectFacesForUser,
  addFaceToSubject,
} = require('./comprefaceClient');
const {
  resolveFacialVisionProviderForTenant,
  pickVisionIntegration,
  parseMeta,
} = require('./facialRecognitionEngine');
const { loadUserFacialReferenceBuffersFromUser } = require('./userFacialEnrollmentBuffers');

/**
 * Mesma integração CompreFace que `/api/vision/verify-face` (plano do tenant + AI_LLM vision).
 * Antes: `name === 'Exadel CompreFace'` — se o registo tiver outro nome ou existir mais do que uma
 * entrada, a galeria sincronizava noutro sítio do que a validação lia.
 */
async function findActiveComprefaceForTenant(prisma, tenantId) {
  const provider = await resolveFacialVisionProviderForTenant(tenantId, prisma);
  const integrations = await prisma.integration.findMany({ where: { type: 'AI_LLM' } });
  const int = pickVisionIntegration(integrations, provider);
  if (!int?.apiKey) return null;
  const meta = parseMeta(int.metadata);
  if (!meta || meta.category !== 'COMPUTER_VISION' || meta.engine !== 'compreface') return null;
  return int;
}

/**
 * Cria/atualiza subject no motor FaceMatch e envia avatar + fotos de matrícula.
 * @returns {Promise<{ ok: boolean, subject?: string, faces?: number, root?: string, error?: string }>}
 */
async function syncUserToCompreface(prisma, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: 'Usuário não encontrado.' };

  const integration = await findActiveComprefaceForTenant(prisma, user.tenantId);
  if (!integration?.apiKey) {
    return {
      ok: false,
      error:
        'Nenhuma integração CompreFace ativa (visão / biometria) alinhada ao plano do tenant, ou API Key em falta. Verifique Integrações e o motor facial no plano.',
    };
  }
  const meta = parseMeta(integration.metadata);
  if (!meta || meta.category !== 'COMPUTER_VISION' || meta.engine !== 'compreface') {
    return { ok: false, error: 'Integração FaceMatch inválida ou inativa.' };
  }

  const buffers = await loadUserFacialReferenceBuffersFromUser(user);

  if (!buffers.length) {
    return { ok: false, error: 'Sem imagens válidas (avatar ou fotos de matrícula).' };
  }

  const subject = comprefaceSubjectName(user.tenantId, user.id);
  const roots = buildComprefaceApiRoots(integration.baseUrl, integration.description);
  const apiKey = String(integration.apiKey).trim();
  let lastErr = '';

  for (const root of roots) {
    try {
      const { cleaned: orphanSubjectsCleaned } = await deleteStaleAriaSubjectFacesForUser(
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

  return { ok: false, error: lastErr || 'Falha ao contatar o FaceMatch em todas as URLs tentadas.' };
}

module.exports = { syncUserToCompreface, findActiveComprefaceForTenant };
