'use strict';

const { stripDataUrlBase64 } = require('./facialRecognitionEngine');
const { validateTechRegProfilePhotoOpenAi } = require('./validateTechRegProfilePhotoOpenAi');

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Corpo comum: POST JSON { imageBase64 } — cadastro prestador passo 1 (IA, não FaceMatch).
 */
async function handleTechnicianProfilePhotoAiValidate(req, res) {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 é obrigatório.' });
    }
    let buf;
    try {
      buf = Buffer.from(stripDataUrlBase64(imageBase64), 'base64');
    } catch {
      return res.status(400).json({ error: 'imageBase64 inválido.' });
    }
    if (!buf || buf.length < 80) {
      return res.status(400).json({ error: 'Imagem demasiado pequena ou inválida.' });
    }
    if (buf.length > MAX_BYTES) {
      return res.status(400).json({ error: 'Imagem demasiado grande (máx. 5 MB).' });
    }

    const result = await validateTechRegProfilePhotoOpenAi(buf);
    res.json({
      approved: result.approved,
      userMessagePtBr: result.userMessagePtBr,
      checks: result.checks,
      rejectReasonsPtBr: result.rejectReasonsPtBr,
      engine: 'openai_vision',
    });
  } catch (err) {
    if (err.code === 'NO_OPENAI_KEY') {
      return res.status(503).json({ error: err.message, code: 'NO_OPENAI_KEY' });
    }
    console.error('[handleTechnicianProfilePhotoAiValidate]', err);
    res.status(500).json({
      error: err.message || 'Erro interno ao analisar a imagem.',
      code: err.code || undefined,
    });
  }
}

module.exports = { handleTechnicianProfilePhotoAiValidate };
