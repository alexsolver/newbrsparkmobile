'use strict';
const router = require('express').Router();
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const {
  stripDataUrlBase64,
  recognizeWithIntegration,
  pickTopRecognitionMatch,
  parseComprefaceSubjectName,
} = require('../lib/comprefaceClient');

const _envSim = process.env.COMPREFACE_MIN_SIMILARITY;
const MIN_SIMILARITY = Math.min(
  0.999,
  Math.max(0.5, _envSim != null && _envSim !== '' ? Number(_envSim) : 0.88)
);

const IDENTIFY_ROLES = new Set(['MANAGER', 'TENANT_ADMIN', 'SAAS_ADMIN']);

/** Texto comum quando o reconhecimento falha — utilizadores sem faces na galeria Recognition. */
const COMPREFACE_SYNC_HINT =
  'No painel BrSpark: Utilizadores → edite o utilizador → secção «Reconhecimento facial» → «Sincronizar com CompreFace» (envia avatar e fotos base para a galeria Recognition).';

function parseMeta(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function pickVisionIntegration(integrations, provider) {
  const vision = integrations.filter((i) => {
    const meta = parseMeta(i.metadata);
    if (!meta || meta.category !== 'COMPUTER_VISION') return false;
    if (provider === 'AWS' && meta.engine !== 'aws_rekognition') return false;
    if (provider === 'COMPREFACE' && meta.engine !== 'compreface') return false;
    if (provider === 'AUTO') return i.status === 'ACTIVE';
    return true;
  });
  if (provider === 'AUTO') {
    const cf = vision.find((i) => parseMeta(i.metadata)?.engine === 'compreface');
    if (cf) return cf;
    return vision.find((i) => parseMeta(i.metadata)?.engine === 'aws_rekognition');
  }
  return vision[0] || null;
}

// POST /api/vision/verify-face
// Payload: { imageBase64, provider?, facialAuthMode?: 'self_verify' | 'identify' }
router.post('/verify-face', authUser, async (req, res) => {
  try {
    const { imageBase64, provider = 'AUTO', facialAuthMode = 'self_verify' } = req.body;
    const mode = String(facialAuthMode).toLowerCase() === 'identify' ? 'identify' : 'self_verify';

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required.' });
    }

    const integrations = await prisma.integration.findMany({ where: { type: 'AI_LLM' } });
    const visionInt = pickVisionIntegration(integrations, provider);

    if (!visionInt) {
      if (provider !== 'AUTO') {
        return res.status(500).json({
          error: `O formulário exige um provedor específico (${provider}), mas suas credenciais não estão configuradas em Integrações.`,
        });
      }
      return res.status(500).json({ error: 'Nenhuma integração de Biometria (AWS/CompreFace) está ativada e configurada.' });
    }

    const meta = parseMeta(visionInt.metadata);
    const engine = meta?.engine || 'unknown';

    if (engine === 'aws_rekognition') {
      return res.status(501).json({
        error: 'AWS Rekognition ainda não implementado para verify-face. Use CompreFace ou configure o campo para outro fluxo.',
        engine: 'aws_rekognition',
        match: false,
      });
    }

    if (engine !== 'compreface') {
      return res.status(500).json({ error: 'Motor de visão não suportado.', match: false });
    }

    let buf;
    try {
      buf = Buffer.from(stripDataUrlBase64(imageBase64), 'base64');
    } catch {
      return res.status(400).json({ error: 'imageBase64 inválido.' });
    }
    if (!buf || buf.length < 64) {
      return res.status(400).json({ error: 'Imagem muito pequena ou inválida.' });
    }

    if (mode === 'identify' && !IDENTIFY_ROLES.has(String(req.user.role || '').toUpperCase())) {
      return res.status(403).json({
        error: 'O modo "identificar utilizador" só está disponível para gestores ou administradores do tenant.',
        match: false,
      });
    }

    let recog;
    try {
      recog = await recognizeWithIntegration(visionInt, buf, { predictionCount: 5 });
    } catch (e) {
      console.error('[VISION] CompreFace recognize', e);
      return res.status(503).json({
        error: `${e.message || 'Falha ao contactar CompreFace.'} Verifique Integrações (CompreFace ativo) e a sincronização da galeria no utilizador.`,
        match: false,
        engine: 'compreface',
      });
    }

    const top = pickTopRecognitionMatch(recog.data);
    if (!top) {
      return res.json({
        engine: 'compreface',
        match: false,
        confidence: null,
        fraud_flag: true,
        message: `Rosto não reconhecido na galeria Recognition do CompreFace (nenhuma correspondência). ${COMPREFACE_SYNC_HINT}`,
      });
    }

    const parsed = parseComprefaceSubjectName(top.subject);
    if (!parsed || parsed.tenantId !== req.user.tenantId) {
      return res.json({
        engine: 'compreface',
        match: false,
        confidence: top.similarity,
        fraud_flag: true,
        message: `Rosto não reconhecido no contexto da sua organização. ${COMPREFACE_SYNC_HINT}`,
      });
    }

    if (top.similarity < MIN_SIMILARITY) {
      return res.json({
        engine: 'compreface',
        match: false,
        confidence: top.similarity,
        fraud_flag: true,
        message: `Rosto não reconhecido com confiança suficiente (mínimo ${MIN_SIMILARITY}; obtido ${Number(top.similarity).toFixed(3)}). Melhore luz/ângulo ou atualize as fotos na galeria CompreFace. ${COMPREFACE_SYNC_HINT}`,
      });
    }

    const identified = await prisma.user.findFirst({
      where: { id: parsed.userId, tenantId: req.user.tenantId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!identified) {
      return res.json({
        engine: 'compreface',
        match: false,
        confidence: top.similarity,
        fraud_flag: true,
        message: `Rosto associado a um utilizador inexistente ou inativo no BrSpark. ${COMPREFACE_SYNC_HINT}`,
      });
    }

    if (mode === 'identify') {
      return res.json({
        engine: 'compreface',
        match: true,
        confidence: top.similarity,
        fraud_flag: false,
        facialAuthMode: 'identify',
        identifiedUser: {
          id: identified.id,
          name: identified.name,
          email: identified.email,
          role: identified.role,
        },
      });
    }

    const selfOk = identified.id === req.user.id;
    return res.json({
      engine: 'compreface',
      match: selfOk,
      confidence: top.similarity,
      fraud_flag: !selfOk,
      facialAuthMode: 'self_verify',
      identifiedUserId: identified.id,
      ...(selfOk
        ? {
            identifiedUser: {
              id: identified.id,
              name: identified.name,
              email: identified.email,
              role: identified.role,
            },
          }
        : {
            message: `Rosto não reconhecido como o utilizador com sessão nesta app. Se for a mesma pessoa, sincronize de novo a galeria CompreFace. ${COMPREFACE_SYNC_HINT}`,
          }),
    });
  } catch (err) {
    console.error('[VISION] Error:', err);
    res.status(500).json({ error: err.message, match: false });
  }
});

module.exports = router;
