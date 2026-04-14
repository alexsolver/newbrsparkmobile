'use strict';

const {
  parseMeta,
  resolveFacialVisionProviderForTenant,
  pickVisionIntegration,
} = require('./facialRecognitionEngine');
const { verifyFacePairWithIntegration } = require('./comprefaceClient');

const _envMin = process.env.TECH_REG_COMPREFACE_VERIFY_MIN_SIMILARITY;
/**
 * Mínimo de similaridade (após comparação bidirecional no cliente HTTP — ver comprefaceClient).
 * Por defeito alinhado ao gate operacional (~0,88) para evitar rostos diferentes.
 */
const TECH_REG_VERIFY_MIN_SIMILARITY = Math.min(
  0.999,
  Math.max(0.55, _envMin != null && _envMin !== '' ? Number(_envMin) : 0.88)
);

/** Passo 3 (foto do documento vs selfie): rosto no papel é pior para o motor — limiar mais baixo. */
const _envIdDoc = process.env.TECH_REG_ID_DOC_VERIFY_MIN_SIMILARITY;
const TECH_REG_ID_DOC_VERIFY_MIN_SIMILARITY = Math.min(
  0.999,
  Math.max(0.5, _envIdDoc != null && _envIdDoc !== '' ? Number(_envIdDoc) : 0.72)
);

/**
 * Traduz falhas do serviço de verificação (corpo JSON ou mensagem) para texto adequado ao usuário final.
 * @param {Error & { status?: number }} err
 * @returns {{ ok: false, code: string, message: string } | null}
 */
function mapVerificationFailureToUserMessage(err) {
  const msg = String((err && err.message) || '');
  const low = msg.toLowerCase();
  let jsonBit = msg;
  try {
    const idx = msg.indexOf('{');
    if (idx >= 0) {
      const maybe = JSON.parse(msg.slice(idx).replace(/\s+/g, ' '));
      if (maybe && typeof maybe.message === 'string') jsonBit = `${maybe.message} ${maybe.code ?? ''}`;
    }
  } catch {
    /* ignore */
  }
  const jl = String(jsonBit).toLowerCase();

  if (
    low.includes('no face') ||
    jl.includes('no face') ||
    /"code"\s*:\s*28\b/.test(msg) ||
    /\bcode\s*[:=]\s*28\b/.test(low)
  ) {
    return {
      ok: false,
      code: 'NO_FACE_DETECTED',
      message:
        'Não encontramos um rosto claro nesta foto. Enquadre só o seu rosto, de frente, com boa luz e sem chapéu, máscara ou óculos escuros.',
    };
  }
  if (low.includes('more than one face') || jl.includes('more than one')) {
    return {
      ok: false,
      code: 'MULTIPLE_FACES',
      message:
        'Apareceu mais de uma pessoa (ou mais de um rosto) na foto. Tire outra imagem só com o seu rosto.',
    };
  }
  if (low.includes('face is too small') || jl.includes('too small')) {
    return {
      ok: false,
      code: 'FACE_TOO_SMALL',
      message: 'O rosto ficou pequeno demais na foto. Aproxime-se da câmera mantendo o rosto inteiro visível.',
    };
  }
  if (low.includes('low quality') || jl.includes('low quality')) {
    return {
      ok: false,
      code: 'LOW_QUALITY_FACE',
      message: 'A qualidade da imagem não foi suficiente. Use mais luz e evite fotos tremidas ou desfocadas.',
    };
  }
  if (
    low.includes('sem similaridade') ||
    jl.includes('sem similaridade') ||
    low.includes('without similarity') ||
    low.includes('no similarity')
  ) {
    return {
      ok: false,
      code: 'VERIFY_NO_SCORE',
      message:
        'Não foi possível comparar os rostos nesta imagem. Tire uma foto mais nítida do documento, com o rosto da foto bem visível e sem reflexo.',
    };
  }
  if (low.includes('aborted') || low.includes('timeout') || low.includes('abort')) {
    return {
      ok: false,
      code: 'BIOMETRY_TIMEOUT',
      message:
        'A verificação demorou demais. Verifique a rede e tente de novo com uma imagem um pouco menor ou melhor iluminada.',
    };
  }
  return null;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} tenantId
 * @param {Buffer} profileBuffer — foto de perfil (referência)
 * @param {Buffer} probeBuffer — nova foto de enrolamento (ou foto do documento no passo 3)
 * @param {{ idDocument?: boolean }} [opts] — `idDocument`: comparação documento vs perfil (mais tolerante)
 * @returns {Promise<{ ok: true, similarity: number } | { ok: false, code?: string, message: string }>}
 */
async function verifyTechRegEnrollmentAgainstProfile(prisma, tenantId, profileBuffer, probeBuffer, opts = {}) {
  const idDocument = opts && opts.idDocument === true;
  const minSimilarity = idDocument ? TECH_REG_ID_DOC_VERIFY_MIN_SIMILARITY : TECH_REG_VERIFY_MIN_SIMILARITY;
  if (!profileBuffer || profileBuffer.length < 64 || !probeBuffer || probeBuffer.length < 64) {
    return { ok: false, code: 'INVALID_IMAGE', message: 'Imagem inválida ou muito pequena.' };
  }

  const provider = await resolveFacialVisionProviderForTenant(tenantId, prisma);
  const integrations = await prisma.integration.findMany({ where: { type: 'AI_LLM' } });
  const visionInt = pickVisionIntegration(integrations, provider);

  if (!visionInt) {
    return {
      ok: false,
      code: 'NO_VISION_INTEGRATION',
      message:
        'O reconhecimento facial ainda não está configurado para esta organização. Peça ao administrador para ativar a integração de visão em Integrações.',
    };
  }

  const meta = parseMeta(visionInt.metadata);
  const engine = meta?.engine || 'unknown';
  if (engine !== 'compreface') {
    return {
      ok: false,
      code: 'UNSUPPORTED_ENGINE',
      message:
        'A verificação facial deste cadastro não está disponível com a configuração atual da organização. Entre em contato com o suporte.',
    };
  }

  const verKey = visionInt.comprefaceVerificationKey && String(visionInt.comprefaceVerificationKey).trim();
  if (!verKey) {
    return {
      ok: false,
      code: 'NO_VERIFICATION_KEY',
      message:
        'Falta configurar a chave de verificação facial no painel (Integrações). Sem ela não é possível comparar novas fotos com a de perfil.',
    };
  }

  try {
    const similarity = await verifyFacePairWithIntegration(visionInt, probeBuffer, profileBuffer, verKey, {
      idDocumentPairing: idDocument,
    });
    if (!Number.isFinite(similarity)) {
      return {
        ok: false,
        code: 'VERIFY_NO_SCORE',
        message: idDocument
          ? 'Não foi possível comparar o rosto no documento com a foto de perfil. Use foto mais nítida, sem reflexo, mostrando bem o rosto da identidade.'
          : 'Não foi possível obter a similaridade entre as fotos. Tente outra imagem.',
      };
    }
    if (similarity < minSimilarity) {
      return {
        ok: false,
        code: 'FACE_MISMATCH',
        message: idDocument
          ? 'O rosto na foto do documento não bate o suficiente com a sua foto de perfil. Confirme que é o mesmo documento e pessoa, com boa luz e sem reflexo no plástico.'
          : 'Esta foto não parece ser a mesma pessoa da foto de perfil do passo 1. Tire outra imagem: rosto de frente, boa iluminação, sem óculos escuros ou itens cobrindo o rosto.',
      };
    }
    return { ok: true, similarity };
  } catch (e) {
    console.error('[techRegComprefaceVerify]', e);
    if (e.code === 'MISSING_VERIFICATION_KEY') {
      return {
        ok: false,
        code: 'NO_VERIFICATION_KEY',
        message:
          'Falta configurar a chave de verificação facial no painel (Integrações). Peça ao administrador.',
      };
    }
    if (e.code === 'MISSING_URL') {
      return {
        ok: false,
        code: 'NO_VISION_INTEGRATION',
        message:
          'URL do serviço de biometria não está configurada. Peça ao administrador para revisar a integração de visão.',
      };
    }
    const mapped = mapVerificationFailureToUserMessage(e);
    if (mapped) return mapped;
    return {
      ok: false,
      code: 'BIOMETRY_SERVICE_ERROR',
      message:
        'Não conseguimos validar esta foto neste momento. Tente outra imagem ou aguarde um pouco e envie de novo.',
    };
  }
}

module.exports = {
  verifyTechRegEnrollmentAgainstProfile,
  TECH_REG_VERIFY_MIN_SIMILARITY,
  TECH_REG_ID_DOC_VERIFY_MIN_SIMILARITY,
};
