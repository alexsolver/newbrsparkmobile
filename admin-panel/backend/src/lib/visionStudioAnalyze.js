'use strict';

const prisma = require('../db');
const { normalizeGoogleGenerativeLanguageBaseUrl } = require('./integrationTester');
const { normalizeVisionAnalyzeResponse } = require('./visionChecklistAnalyze');

const GOOGLE_AI_STUDIO_NAMES = ['Google AI Studio', 'Google AI (Gemini)'];

function prismaWhereGoogleAiStudioIntegration() {
  return {
    type: 'AI_LLM',
    OR: GOOGLE_AI_STUDIO_NAMES.map((name) => ({ name })),
  };
}

async function findGoogleAiStudioIntegration() {
  return prisma.integration.findFirst({
    where: prismaWhereGoogleAiStudioIntegration(),
  });
}

/** Padrão estável para Visão IA (Gemini API); 2.0-flash ficou indisponível para contas novas. */
const GEMINI_DEFAULT_MODEL_ID = 'gemini-2.5-flash';

function normalizeGeminiModelId(rawId) {
  let id = String(rawId || '')
    .trim()
    .replace(/^models\//, '');
  if (!id) return GEMINI_DEFAULT_MODEL_ID;
  // Migração automática: 2.0 depreciado / bloqueado para novas chaves → 2.5 (ai.google.dev/gemini-api/docs/models).
  if (id === 'gemini-2.0-flash' || id === 'gemini-2.0-flash-001') return 'gemini-2.5-flash';
  if (id === 'gemini-2.0-flash-lite' || id === 'gemini-2.0-flash-lite-001') return 'gemini-2.5-flash-lite';
  return id;
}

function pickGeminiModelId(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  const raw = String(m.defaultModel || m.model || '').trim();
  const mid = raw.replace(/^models\//, '');
  return normalizeGeminiModelId(mid);
}

/**
 * Analisa imagem/vídeo com Gemini (integração Google AI Studio) e devolve o mesmo envelope
 * que o proxy YOLO após `normalizeVisionAnalyzeResponse`.
 *
 * @param {{ buffer: Buffer, mimetype: string, questions: { id: string, text: string }[], integration: object, visionRating0To10?: boolean }} opts
 * @returns {Promise<{ ok: true, payload: object } | { ok: false, error: string }>}
 */
async function analyzeWithGoogleAiStudio(opts) {
  const { buffer, mimetype, questions, integration, visionRating0To10 } = opts;
  const wantRating = visionRating0To10 === true;
  const apiKey = String(integration.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'Integração Google AI Studio sem API key configurada.' };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, error: 'Mídia vazia.' };
  }

  const maxInline = 18 * 1024 * 1024;
  if (buffer.length > maxInline) {
    return {
      ok: false,
      error:
        'Arquivo muito grande para análise Gemini nesta versão (limite ~18 MB). Use vídeo mais curto, menor resolução ou somente foto.',
    };
  }

  const baseRoot = normalizeGoogleGenerativeLanguageBaseUrl(integration.baseUrl || '');
  const modelId = pickGeminiModelId(integration.metadata);
  const url = `${baseRoot}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const qBlock = questions.map((q) => `- id=${JSON.stringify(q.id)} — ${q.text}`).join('\n');
  const singleStructured = questions.length === 1;
  const q0 = questions[0];
  const q0id = String(q0?.id || 'q1').replace(/"/g, '');
  const jsonShapeSingle =
    wantRating && singleStructured
      ? `{"rating0To10":<inteiro 0-10 ou null>,"answers":[{"questionId":${JSON.stringify(q0id)},"value":"<string>","confidence":0.0,"rationale":"pt-BR, opcional"}]}`
      : `{"answers":[{"questionId":${JSON.stringify(q0id)},"value":"<string>","confidence":0.0,"rationale":"pt-BR, opcional"}]}`;
  const ratingRules =
    wantRating && singleStructured
      ? '\n\nNa raiz do JSON inclua "rating0To10": inteiro entre 0 e 10 (inclusivo), coerente com o critério do prompt, ou null se for impossível avaliar com segurança. Este campo é obrigatório na raiz (pode ser null).'
      : '';
  const instruction = singleStructured
    ? 'Analise a mídia anexa (imagem ou vídeo) seguindo estritamente o prompt abaixo. Baseie-se apenas no que é visível.\n\n' +
      '--- Prompt ---\n' +
      String(q0?.text || '') +
      '\n--- Fim do prompt ---\n\n' +
      'Responda somente com JSON neste formato (sem markdown, sem texto fora do JSON):\n' +
      jsonShapeSingle +
      '\n' +
      'Campo value (string curta, sem quebras de linha):\n' +
      '- Se o prompt for estritamente sim/não, use exatamente yes, no ou unknown (inglês).\n' +
      '- Caso contrário, coloque em value a resposta direta pedida (ex.: nota "5", "8/10", rótulo breve). Não use parágrafos em value; detalhe em rationale.\n' +
      'confidence entre 0 e 1. Inclua exatamente uma entrada em answers (questionId igual ao indicado).' +
      ratingRules
    : 'Analise a mídia anexa (imagem ou vídeo) e responda a cada pergunta abaixo com base apenas no que é visível.\n\n' +
      'Perguntas (use exatamente estes ids no campo questionId de cada resposta):\n' +
      qBlock +
      '\n\nResponda somente com JSON neste formato (sem markdown, sem texto fora do JSON):\n' +
      '{"answers":[{"questionId":"q1","value":"yes"|"no"|"unknown","confidence":0.0,"rationale":"breve pt-BR"}]}\n' +
      'value deve ser yes, no ou unknown (sempre em inglês). confidence entre 0 e 1. Inclua uma entrada em answers para cada pergunta.';

  const mime = String(mimetype || 'application/octet-stream').slice(0, 120);

  const bodyPrimary = {
    contents: [
      {
        parts: [
          { text: instruction },
          {
            inline_data: {
              mime_type: mime,
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.12,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  /** Alinhado ao `timeoutMs` do app em `app/checklist/[id].tsx` (visão IA — análise). */
  const timeoutMs = 360000;

  async function postGemini(payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return { res, text };
  }

  let { res, text } = await postGemini(bodyPrimary);
  if (!res.ok && res.status === 400 && /responseMimeType|response_mime_type|mimeType/i.test(text)) {
    const fallbackBody = JSON.parse(JSON.stringify(bodyPrimary));
    if (fallbackBody.generationConfig) delete fallbackBody.generationConfig.responseMimeType;
    ({ res, text } = await postGemini(fallbackBody));
  }

  if (!res.ok) {
    let hint = text.slice(0, 420).replace(/\s+/g, ' ');
    try {
      const j = JSON.parse(text);
      hint = String(j?.error?.message || j?.message || hint);
    } catch (_) {
      /* keep hint */
    }
    return { ok: false, error: `Google AI Studio (Gemini) HTTP ${res.status}: ${hint}` };
  }

  let outer;
  try {
    outer = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Resposta da API Gemini não é JSON válido.' };
  }

  const cand = outer?.candidates?.[0];
  const finish = cand?.finishReason != null ? String(cand.finishReason) : '';
  if (finish && finish !== 'STOP' && finish !== 'FINISH_REASON_STOP') {
    const msg =
      finish === 'SAFETY' || finish === 'BLOCKLIST'
        ? 'A API Gemini bloqueou a análise (políticas de segurança). Tente outra mídia ou ajuste as perguntas.'
        : `A API Gemini não concluiu a análise (motivo: ${finish}).`;
    return { ok: false, error: msg };
  }

  const parts = cand?.content?.parts;
  let rawText = '';
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p && typeof p === 'object' && p.text != null) rawText += String(p.text);
    }
  }
  rawText = rawText.trim();
  if (!rawText) {
    return { ok: false, error: 'Resposta Gemini sem texto utilizável (candidates vazio ou conteúdo bloqueado).' };
  }

  let inner;
  try {
    inner = JSON.parse(rawText);
  } catch {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        inner = JSON.parse(m[0]);
      } catch {
        inner = null;
      }
    }
  }
  if (!inner || typeof inner !== 'object') {
    return { ok: false, error: 'O modelo não devolveu JSON analisável com a lista "answers".' };
  }

  return normalizeVisionAnalyzeResponse(inner, questions, { visionRating0To10: wantRating });
}

module.exports = {
  GOOGLE_AI_STUDIO_NAMES,
  prismaWhereGoogleAiStudioIntegration,
  findGoogleAiStudioIntegration,
  analyzeWithGoogleAiStudio,
};
