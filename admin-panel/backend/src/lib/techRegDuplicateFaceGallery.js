'use strict';

const {
  parseMeta,
  resolveFacialVisionProviderForTenant,
  pickVisionIntegration,
} = require('./facialRecognitionEngine');
const { recognizeWithIntegration, parseComprefaceSubjectName } = require('./comprefaceClient');

const _envDup = process.env.TECH_REG_DUPLICATE_FACE_MIN_SIMILARITY;
/** Limiar para considerar o rosto «já na galeria» de outro utilizador (reconhecimento CompreFace). */
const DUPLICATE_FACE_MIN_SIMILARITY = Math.min(
  0.999,
  Math.max(0.75, _envDup != null && _envDup !== '' ? Number(_envDup) : 0.86)
);

const _envDupTimeout = process.env.TECH_REG_DUP_FACE_TIMEOUT_MS;
/** Reconhecimento na submissão: limite inferior ao timeout global do recognize (45s) para não somar com materialize e estourar 504 no gateway. */
const DUPLICATE_FACE_RECOGNIZE_TIMEOUT_MS = Math.min(
  60000,
  Math.max(5000, _envDupTimeout != null && _envDupTimeout !== '' ? Number(_envDupTimeout) : 20000)
);

/**
 * Verifica se a imagem já corresponde na galeria de reconhecimento a **outro** utilizador activo.
 * Usa a mesma integração CompreFace que o resto da biometria (chave de reconhecimento, não verificação).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ registrationTenantId: string, candidateUserId: string, probeBuffer: Buffer }} opts
 * @returns {Promise<{ ok: true, skipped?: boolean } | { ok: false, code: string, message: string }>}
 */
async function assertTechRegProbeNotDuplicateOtherUser(prisma, opts) {
  const registrationTenantId = String(opts.registrationTenantId || '').trim();
  const candidateUserId = String(opts.candidateUserId || '').trim();
  const probeBuffer = opts.probeBuffer;
  if (!registrationTenantId || !candidateUserId || !probeBuffer || probeBuffer.length < 64) {
    return { ok: true, skipped: true };
  }

  let visionInt;
  try {
    const provider = await resolveFacialVisionProviderForTenant(registrationTenantId, prisma);
    const integrations = await prisma.integration.findMany({ where: { type: 'AI_LLM' } });
    visionInt = pickVisionIntegration(integrations, provider);
    const meta = visionInt ? parseMeta(visionInt.metadata) : null;
    if (!visionInt || meta?.engine !== 'compreface') {
      return { ok: true, skipped: true };
    }
    const apiKey = visionInt.apiKey && String(visionInt.apiKey).trim();
    if (!apiKey) {
      return { ok: true, skipped: true };
    }
  } catch (e) {
    console.warn('[techRegDuplicateFaceGallery] setup', e.message);
    return { ok: true, skipped: true };
  }

  let recog;
  try {
    recog = await recognizeWithIntegration(visionInt, probeBuffer, {
      predictionCount: 12,
      timeoutMs: DUPLICATE_FACE_RECOGNIZE_TIMEOUT_MS,
    });
  } catch (e) {
    console.warn('[techRegDuplicateFaceGallery] recognize', e.message);
    return { ok: true, skipped: true };
  }

  const data = recog && recog.data;
  const results = data && Array.isArray(data.result) ? data.result : [];
  if (!results.length) return { ok: true };
  const face = results[0];
  const subjects = face && Array.isArray(face.subjects) ? face.subjects : [];
  const minSim = DUPLICATE_FACE_MIN_SIMILARITY;

  for (const sub of subjects) {
    const sim = Number(sub && sub.similarity);
    if (!Number.isFinite(sim) || sim < minSim) break;
    const parsed = parseComprefaceSubjectName(sub && sub.subject != null ? String(sub.subject) : '');
    if (!parsed) continue;
    if (String(parsed.userId) === candidateUserId) continue;
    const other = await prisma.user.findFirst({
      where: { id: parsed.userId, isActive: true, tenantId: registrationTenantId },
      select: { id: true },
    });
    if (other) {
      return {
        ok: false,
        code: 'FACE_ALREADY_REGISTERED',
        message:
          'Este rosto já está associado a outra conta de utilizador nesta organização. Não é permitido concluir o cadastro com a mesma identidade facial em duas contas. Utilize a conta existente ou contacte o suporte.',
      };
    }
  }

  return { ok: true };
}

module.exports = {
  assertTechRegProbeNotDuplicateOtherUser,
  DUPLICATE_FACE_MIN_SIMILARITY,
  DUPLICATE_FACE_RECOGNIZE_TIMEOUT_MS,
};
