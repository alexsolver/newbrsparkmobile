'use strict';

/**
 * Traduz falhas do serviço de verificação CompreFace para texto ao utilizador.
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

module.exports = { mapVerificationFailureToUserMessage };
