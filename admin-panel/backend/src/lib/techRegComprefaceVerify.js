'use strict';

const {
  parseMeta,
  resolveFacialVisionProviderForTenant,
  pickVisionIntegration,
} = require('./facialRecognitionEngine');
const { verifyFacePairWithIntegration } = require('./comprefaceClient');

const _envMin = process.env.TECH_REG_COMPREFACE_VERIFY_MIN_SIMILARITY;
/** Mínimo de similaridade CompreFace Verification (mesma pessoa vs foto de perfil). Mais baixo que o gate de OS (0,88). */
const TECH_REG_VERIFY_MIN_SIMILARITY = Math.min(
  0.999,
  Math.max(0.45, _envMin != null && _envMin !== '' ? Number(_envMin) : 0.72)
);

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 * @param {Buffer} profileBuffer — foto de perfil (referência)
 * @param {Buffer} probeBuffer — nova foto de enrolamento
 * @returns {Promise<{ ok: true, similarity: number } | { ok: false, code?: string, message: string }>}
 */
async function verifyTechRegEnrollmentAgainstProfile(prisma, tenantId, profileBuffer, probeBuffer) {
  if (!profileBuffer || profileBuffer.length < 64 || !probeBuffer || probeBuffer.length < 64) {
    return { ok: false, code: 'INVALID_IMAGE', message: 'Imagem inválida ou demasiado pequena.' };
  }

  const provider = await resolveFacialVisionProviderForTenant(tenantId, prisma);
  const integrations = await prisma.integration.findMany({ where: { type: 'AI_LLM' } });
  const visionInt = pickVisionIntegration(integrations, provider);

  if (!visionInt) {
    return {
      ok: false,
      code: 'NO_VISION_INTEGRATION',
      message:
        'Biometria não configurada no servidor. Peça ao administrador para configurar o CompreFace em Integrações.',
    };
  }

  const meta = parseMeta(visionInt.metadata);
  const engine = meta?.engine || 'unknown';
  if (engine !== 'compreface') {
    return {
      ok: false,
      code: 'UNSUPPORTED_ENGINE',
      message: 'O enrolamento biométrico do cadastro de prestador requer CompreFace (Verification).',
    };
  }

  const verKey = visionInt.comprefaceVerificationKey && String(visionInt.comprefaceVerificationKey).trim();
  if (!verKey) {
    return {
      ok: false,
      code: 'NO_VERIFICATION_KEY',
      message:
        'Configure a **API Key do serviço Verification** do CompreFace no painel (Integrações → mesma entrada do CompreFace). Sem ela não é possível comparar as fotos com a de perfil.',
    };
  }

  try {
    const similarity = await verifyFacePairWithIntegration(visionInt, probeBuffer, profileBuffer, verKey);
    if (!Number.isFinite(similarity)) {
      return {
        ok: false,
        code: 'VERIFY_NO_SCORE',
        message: 'Não foi possível obter a similaridade entre as fotos. Tente outra imagem.',
      };
    }
    if (similarity < TECH_REG_VERIFY_MIN_SIMILARITY) {
      return {
        ok: false,
        code: 'FACE_MISMATCH',
        message: `O rosto não corresponde à foto de perfil do passo 1 (similaridade ${similarity.toFixed(2)}; mínimo ${TECH_REG_VERIFY_MIN_SIMILARITY}). Tire outra foto com o mesmo rosto.`,
      };
    }
    return { ok: true, similarity };
  } catch (e) {
    console.error('[techRegComprefaceVerify]', e);
    const msg = e.message || 'Falha ao contactar o CompreFace.';
    if (e.code === 'MISSING_VERIFICATION_KEY') {
      return {
        ok: false,
        code: 'NO_VERIFICATION_KEY',
        message:
          'Configure a API Key do serviço **Verification** do CompreFace nas Integrações do painel.',
      };
    }
    return { ok: false, code: 'COMPREFACE_ERROR', message: msg };
  }
}

module.exports = {
  verifyTechRegEnrollmentAgainstProfile,
  TECH_REG_VERIFY_MIN_SIMILARITY,
};
