'use strict';

const express = require('express');
const multer = require('multer');
const prisma = require('../db');
const authUser = require('../middleware/authUser');
const {
  VISION_INTEGRATION_NAME,
  prismaWhereVisionChecklistIntegration,
  normalizeVisionAnalyzeResponse,
  buildMultipartBuffer,
  fetchVisionPostPreservingMethod,
} = require('../lib/visionChecklistAnalyze');
const { findGoogleAiStudioIntegration, analyzeWithGoogleAiStudio } = require('../lib/visionStudioAnalyze');
const { consumeQuota } = require('../lib/planQuotaService');
const {
  MAX_VISION_SIMNAO_QUESTIONS,
  MAX_VISION_STRUCTURED_PROMPT_CHARS,
} = require('../constants/visionSimNaoQuestions');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 95 * 1024 * 1024 },
});

/**
 * POST /api/checklists/vision/analyze
 * multipart: media (imagem ou vídeo), questions (JSON array {id,text}), engine, opcional visionRating0To10 (1/true para nota 0–10 na raiz do JSON, só Gemini)
 * Autenticação: JWT do app (técnico).
 */
router.post('/vision/analyze', authUser, upload.single('media'), async (req, res) => {
  /** Origem+path da integração (para mensagens de erro; sem query/chave). */
  let visionIntegrationTarget = '';
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Envie o arquivo no campo "media".' });
    }

    let questions = [];
    const rawQ = req.body && req.body.questions != null ? req.body.questions : '';
    if (typeof rawQ === 'string' && rawQ.trim()) {
      try {
        const parsed = JSON.parse(rawQ);
        if (Array.isArray(parsed)) {
          const mapped = parsed
            .map((x, i) => {
              if (!x || typeof x !== 'object') return null;
              const id = String(x.id || `q_${i + 1}`).replace(/[^\w-]/g, '_').slice(0, 64);
              return { id, rawText: String(x.text || x.question || '').trim() };
            })
            .filter((x) => x && x.rawText);
          const textMax =
            mapped.length <= 1 ? MAX_VISION_STRUCTURED_PROMPT_CHARS : 500;
          questions = mapped
            .map((x) => {
              const text = x.rawText.slice(0, textMax);
              if (!text) return null;
              return { id: x.id, text };
            })
            .filter(Boolean);
        }
      } catch {
        return res.status(400).json({ error: 'Campo "questions" deve ser JSON válido (array de {id, text}).' });
      }
    }
    if (!questions.length) {
      return res.status(400).json({ error: 'Indique pelo menos uma pergunta (questions).' });
    }
    if (questions.length > MAX_VISION_SIMNAO_QUESTIONS) {
      return res.status(400).json({
        error: `Máximo de ${MAX_VISION_SIMNAO_QUESTIONS} perguntas por análise.`,
      });
    }

    const mt = String(file.mimetype || '').toLowerCase();
    const isImage = mt.startsWith('image/');
    const isVideo = mt.startsWith('video/');
    if (!isImage && !isVideo) {
      return res.status(400).json({ error: 'O arquivo deve ser imagem ou vídeo.' });
    }

    const engine = String((req.body && req.body.engine) || '').trim().toLowerCase();
    const useGoogleStudio =
      engine === 'google_ai_studio' || engine === 'gemini' || engine === 'google_ai';
    const visionRating0To10 =
      req.body &&
      (req.body.visionRating0To10 === true ||
        req.body.visionRating0To10 === '1' ||
        req.body.visionRating0To10 === 'true');

    if (useGoogleStudio) {
      const studioInt = await findGoogleAiStudioIntegration();
      if (!studioInt || !String(studioInt.apiKey || '').trim()) {
        return res.status(503).json({
          error:
            'Integração "Google AI Studio" não configurada ou sem API key. Configure em Integrações no painel admin.',
        });
      }
      if (req.user?.tenantId) {
        const q = await consumeQuota(prisma, req.user.tenantId, 'AI_VISION_ANALYSIS', 1);
        if (!q.ok) {
          return res.status(403).json({ error: q.error, code: q.code || 'PLAN_QUOTA_EXCEEDED' });
        }
      }
      try {
        const normalized = await analyzeWithGoogleAiStudio({
          buffer: file.buffer,
          mimetype: file.mimetype || mt,
          questions,
          integration: studioInt,
          visionRating0To10,
        });
        if (!normalized.ok) {
          return res.status(502).json({ error: normalized.error });
        }
        return res.json(normalized.payload);
      } catch (e) {
        const name = e && e.name;
        const msg = e && e.message ? String(e.message) : String(e);
        const isTimeout = name === 'AbortError' || name === 'TimeoutError';
        const outMsg = isTimeout
          ? 'Tempo esgotado ao contatar o Google AI Studio (Gemini).'
          : msg;
        const status = isTimeout ? 502 : 500;
        console.error('[checklists/vision/analyze] google_ai_studio', {
          status,
          name,
          msg,
          stack: e && e.stack,
        });
        return res.status(status).json({ error: outMsg });
      }
    }

    const integration = await prisma.integration.findFirst({
      where: prismaWhereVisionChecklistIntegration(),
    });
    if (!integration || !String(integration.baseUrl || '').trim()) {
      return res.status(503).json({
        error:
          'Integração "Visão IA - YOLO" não configurada. Configure URL e chave em Integrações no painel admin.',
      });
    }

    const baseUrl = String(integration.baseUrl).trim().replace(/\/+$/, '');
    const apiKey = integration.apiKey != null ? String(integration.apiKey).trim() : '';

    if (req.user?.tenantId) {
      const q = await consumeQuota(prisma, req.user.tenantId, 'AI_VISION_DETECTION', 1);
      if (!q.ok) {
        return res.status(403).json({ error: q.error, code: q.code || 'PLAN_QUOTA_EXCEEDED' });
      }
    }

    try {
      const u = new URL(baseUrl);
      const pathHint = u.pathname && u.pathname !== '/' ? u.pathname : '';
      visionIntegrationTarget = `${u.origin}${pathHint}`;
      console.warn('[checklists/vision/analyze] Proxy → serviço externo:', visionIntegrationTarget);
    } catch {
      visionIntegrationTarget = String(baseUrl).slice(0, 160);
      console.warn('[checklists/vision/analyze] URL da integração (inválida?):', visionIntegrationTarget);
    }

    const boundary = '----BrSparkVision' + Date.now().toString(36);
    const bodyBuf = buildMultipartBuffer(boundary, [
      {
        name: 'media',
        value: file.buffer,
        filename: file.originalname || (isVideo ? 'upload.mp4' : 'upload.jpg'),
        contentType: file.mimetype || 'application/octet-stream',
      },
      { name: 'questions', value: JSON.stringify(questions) },
      { name: 'schemaVersion', value: '1' },
    ]);

    const timeoutMs =
      integration.metadata &&
      typeof integration.metadata === 'object' &&
      integration.metadata.timeoutMs != null
        ? Math.min(300_000, Math.max(10_000, parseInt(String(integration.metadata.timeoutMs), 10) || 120_000))
      : 120_000;

    const extRes = await fetchVisionPostPreservingMethod(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: bodyBuf,
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await extRes.text();
    if (!extRes.ok) {
      const st = extRes.status;
      let hint = '';
      if (st === 405 || st === 404) {
        hint =
          ' Confirme no painel o URL completo do endpoint que aceita POST multipart (campos media, questions). HTTP 405/404 costuma indicar caminho errado ou redirecionamento que não aceita POST.';
        if (st === 405 && /nginx/i.test(text) && /405 Not Allowed/i.test(text)) {
          hint +=
            ' Esta resposta é do nginx: o URL provavelmente aponta para o servidor web (ex.: porta 80) sem encaminhar POST para a API — use o host/porta diretos do Uvicorn/Gunicorn ou um path com proxy_pass para o backend.';
        }
      }
      const allow = extRes.headers.get('allow');
      return res.status(502).json({
        error: `O serviço de visão devolveu HTTP ${st}.${hint}`,
        detail: text.slice(0, 500),
        ...(visionIntegrationTarget ? { integrationTarget: visionIntegrationTarget } : {}),
        ...(allow ? { allow } : {}),
      });
    }

    const normalized = normalizeVisionAnalyzeResponse(text, questions);
    if (!normalized.ok) {
      return res.status(502).json({
        error: normalized.error,
        ...(visionIntegrationTarget ? { integrationTarget: visionIntegrationTarget } : {}),
      });
    }

    res.json(normalized.payload);
  } catch (e) {
    const name = e && e.name;
    const msg = e && e.message ? String(e.message) : String(e);
    const lower = msg.toLowerCase();
    const isTimeout = name === 'AbortError' || name === 'TimeoutError';
    const isUpstreamNet =
      /fetch failed|failed to fetch|econnrefused|enotfound|etimedout|socket hang up|network/i.test(lower);
    const outMsg = isTimeout
      ? 'Tempo esgotado ao contatar o serviço de visão (integração «Visão IA - YOLO»).'
      : isUpstreamNet
        ? `O servidor BrSpark não conseguiu contatar o URL da integração de visão (YOLO). O pedido parte do computador onde roda o Node (backend, porta 3001), não do celular: esse PC precisa resolver o DNS e abrir TCP a esse host (mesma VPN que o serviço, firewall, http/https corretos). Confirme no painel a integração «Visão IA - YOLO». Detalhe: ${msg}`
        : msg;
    const status = isTimeout || isUpstreamNet ? 502 : 500;
    console.error('[checklists/vision/analyze]', {
      status,
      name,
      msg,
      integrationTarget: visionIntegrationTarget || undefined,
      stack: e && e.stack,
    });
    res.status(status).json({
      error: outMsg,
      ...(visionIntegrationTarget ? { integrationTarget: visionIntegrationTarget } : {}),
    });
  }
});

module.exports = router;
