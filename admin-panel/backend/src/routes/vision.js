'use strict';
/**
 * API de «visão» operacional: biometria / verificação facial alinhada ao plano do tenant (FaceMatch, etc.).
 * NÃO inclui o gate de foto do cadastro de prestador — isso está em routes/aiTechnicianProfilePhoto.js.
 */
const router = require('express').Router();
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const { stripDataUrlBase64, verifyFacialImageBuffer } = require('../lib/facialRecognitionEngine');
const { consumeQuota } = require('../lib/planQuotaService');

// POST /api/vision/verify-face
// Payload: { imageBase64, facialAuthMode?: 'self_verify' | 'identify' }
// O motor de biometria vem do plano do tenant — não do corpo do pedido.
router.post('/verify-face', authUser, async (req, res) => {
  try {
    const { imageBase64, facialAuthMode = 'self_verify' } = req.body;
    const mode = String(facialAuthMode).toLowerCase() === 'identify' ? 'identify' : 'self_verify';

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required.' });
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

    const result = await verifyFacialImageBuffer(prisma, {
      tenantId: req.user.tenantId,
      sessionUserId: req.user.id,
      mode,
      imageBuffer: buf,
    });

    if (result.skip) {
      return res.status(503).json({
        error: result.audit.message || 'Serviço de biometria indisponível.',
        match: false,
        engine: 'server',
      });
    }

    if (!result.ok) {
      const a = result.audit;
      return res.json({
        engine: a.engine || 'server',
        match: false,
        confidence: a.confidence ?? null,
        fraud_flag: true,
        message: a.message,
        facialAuthMode: a.facialAuthMode || mode,
      });
    }

    const a = result.audit;
    if (req.user.tenantId) {
      const q = await consumeQuota(prisma, req.user.tenantId, 'AI_FACIAL', 1);
      if (!q.ok) {
        return res.status(403).json({
          error: q.error,
          code: q.code || 'PLAN_QUOTA_EXCEEDED',
          match: false,
          engine: 'server',
        });
      }
    }
    if (a.facialAuthMode === 'identify' && a.identifiedUser) {
      return res.json({
        engine: 'server',
        match: true,
        confidence: a.confidence,
        fraud_flag: false,
        facialAuthMode: 'identify',
        identifiedUserId: a.identifiedUser.id,
        identifiedUser: a.identifiedUser,
      });
    }

    return res.json({
      engine: 'server',
      match: true,
      confidence: a.confidence,
      fraud_flag: false,
      facialAuthMode: 'self_verify',
      identifiedUserId: a.identifiedUserId,
      identifiedUser: a.identifiedUser,
    });
  } catch (err) {
    console.error('[VISION] Error:', err);
    res.status(500).json({
      error: 'Erro interno ao validar a biometria facial.',
      match: false,
    });
  }
});

module.exports = router;
