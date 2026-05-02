'use strict';

const prisma = require('../db');
const { normalizeGoogleGenerativeLanguageBaseUrl } = require('./integrationTester');
const {
  normalizeVisionAnalyzeResponse,
  buildVisionSingleQuestionJsonExampleLines,
  VISION_SINGLE_STRUCTURED_DISCIPLINE,
  VISION_RATIONALE_LANGUAGE_BLOCK,
} = require('./visionChecklistAnalyze');

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
  const jsonShapeSingle = singleStructured ? buildVisionSingleQuestionJsonExampleLines(q0id, wantRating) : '';
  const ratingRules =
    wantRating && singleStructured
      ? '\n\nNa raiz do JSON inclua "rating0To10": inteiro entre 0 e 10 (inclusivo), coerente com o critério do prompt, ou null se for impossível avaliar com segurança. Este campo é obrigatório na raiz (pode ser null).'
      : '';
  const instruction = singleStructured
    ? VISION_RATIONALE_LANGUAGE_BLOCK +
      'Analise a mídia anexa (imagem ou vídeo) seguindo estritamente o prompt abaixo. Baseie-se apenas no que é visível.\n\n' +
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
      ratingRules +
      VISION_SINGLE_STRUCTURED_DISCIPLINE
    : VISION_RATIONALE_LANGUAGE_BLOCK +
      'Analise a mídia anexa (imagem ou vídeo) e responda a cada pergunta abaixo com base apenas no que é visível.\n\n' +
      'Perguntas (use exatamente estes ids no campo questionId de cada resposta):\n' +
      qBlock +
      '\n\nResponda somente com JSON neste formato (sem markdown, sem texto fora do JSON):\n' +
      '{"answers":[{"questionId":"q1","value":"yes","confidence":0.74,"rationale":"Breve resumo em português do observado na imagem."}]}\n' +
      'value deve ser yes, no ou unknown (sempre em inglês). confidence entre 0 e 1 (evite 0,0 salvo imagem inútil). rationale: texto real em pt-BR. Inclua uma entrada em answers para cada pergunta.';

  const mime = String(mimetype || 'application/octet-stream').slice(0, 120);

  const bodyPrimary = {
    systemInstruction: {
      parts: [
        {
          text:
            'És um assistente de inspeção de campo. Regra fixa: em todo o JSON devolvido, o campo answers[].rationale deve estar apenas em português do Brasil. ' +
            'Não uses inglês em rationale. Os valores yes, no e unknown em value mantêm-se em inglês por convenção do sistema.',
        },
      ],
    },
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

/**
 * Compara duas imagens (referência vs cena atual) via Gemini; sempre inclui rating 0–10 + rationale das diferenças.
 *
 * @param {{ referenceBuffer: Buffer, referenceMimetype: string, sceneBuffer: Buffer, sceneMimetype: string, questions: { id: string, text: string }[], integration: object }} opts
 * @returns {Promise<{ ok: true, payload: object } | { ok: false, error: string }>}
 */
async function analyzeWithGoogleAiStudioComparison(opts) {
  const {
    referenceBuffer,
    referenceMimetype,
    sceneBuffer,
    sceneMimetype,
    questions,
    integration,
  } = opts;
  const apiKey = String(integration.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'Integração Google AI Studio sem API key configurada.' };
  }
  if (!Buffer.isBuffer(referenceBuffer) || referenceBuffer.length < 32) {
    return { ok: false, error: 'Imagem de referência vazia ou inválida.' };
  }
  if (!Buffer.isBuffer(sceneBuffer) || sceneBuffer.length < 32) {
    return { ok: false, error: 'Imagem da cena atual vazia ou inválida.' };
  }

  const maxInline = 18 * 1024 * 1024;
  if (referenceBuffer.length > maxInline || sceneBuffer.length > maxInline) {
    return {
      ok: false,
      error:
        'Uma das imagens é demasiado grande para o Gemini nesta versão (limite ~18 MB por imagem). Reduza a resolução.',
    };
  }

  const baseRoot = normalizeGoogleGenerativeLanguageBaseUrl(integration.baseUrl || '');
  const modelId = pickGeminiModelId(integration.metadata);
  const url = `${baseRoot}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const q0 = questions && questions[0];
  const q0id = String(q0?.id || 'q1').replace(/"/g, '');
  const jsonShapeSingle = buildVisionSingleQuestionJsonExampleLines(q0id, true);
  const userCriteria = String(q0?.text || '').trim();
  const instruction =
    VISION_RATIONALE_LANGUAGE_BLOCK +
    'Recebeu DUAS imagens nesta ordem:\n' +
    '(1) PRIMEIRA imagem anexa = REFERÊNCIA (padrão esperado definido pelo checklist).\n' +
    '(2) SEGUNDA imagem anexa = CENA ATUAL (foto capturada em campo pelo técnico).\n\n' +
    'Compare a CENA ATUAL com a REFERÊNCIA apenas pelo que é visível.\n\n' +
    '--- Critérios / prompt ---\n' +
    userCriteria +
    '\n--- Fim dos critérios ---\n\n' +
    'Responda somente com JSON neste formato (sem markdown, sem texto fora do JSON):\n' +
    jsonShapeSingle +
    '\n' +
    'Regras específicas de COMPARAÇÃO:\n' +
    '- Na raiz inclua sempre "rating0To10": inteiro de 0 a 10 medindo a semelhança / aderência da cena atual à referência face aos critérios acima (10 = corresponde ao padrão; 0 = muito diferente ou não aplicável). Use null apenas se for impossível julgar com segurança.\n' +
    '- Em answers[0].value envie os dígitos da mesma nota como string (ex.: "8") ou "unknown" se não for possível avaliar.\n' +
    '- Em answers[0].rationale (pt-BR, obrigatório, texto útil): explique as principais SEMELHANÇAS e DIFERENÇAS entre as duas imagens (ângulo, iluminação, objetos em falta ou a mais, estado, organização, sujidade, etiquetas, etc.). Não use inglês no rationale.\n' +
    'confidence entre 0 e 1. Inclua exatamente uma entrada em answers.' +
    VISION_SINGLE_STRUCTURED_DISCIPLINE;

  const refMime = String(referenceMimetype || 'image/jpeg').slice(0, 120);
  const scMime = String(sceneMimetype || 'image/jpeg').slice(0, 120);

  const bodyPrimary = {
    systemInstruction: {
      parts: [
        {
          text:
            'És um assistente de inspeção de campo. Comparas uma imagem de referência com uma foto atual. ' +
            'O campo answers[].rationale deve estar apenas em português do Brasil e deve destacar diferenças concretas entre as duas imagens.',
        },
      ],
    },
    contents: [
      {
        parts: [
          { text: instruction },
          {
            inline_data: {
              mime_type: refMime,
              data: referenceBuffer.toString('base64'),
            },
          },
          {
            text:
              'Imagem acima: REFERÊNCIA (padrão). Segue a imagem da CENA ATUAL capturada em campo.',
          },
          {
            inline_data: {
              mime_type: scMime,
              data: sceneBuffer.toString('base64'),
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
        ? 'A API Gemini bloqueou a análise (políticas de segurança). Tente outras imagens ou ajuste os critérios.'
        : `A API Gemini não concluiu a comparação (motivo: ${finish}).`;
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

  return normalizeVisionAnalyzeResponse(inner, questions, { visionRating0To10: true });
}

module.exports = {
  GOOGLE_AI_STUDIO_NAMES,
  prismaWhereGoogleAiStudioIntegration,
  findGoogleAiStudioIntegration,
  analyzeWithGoogleAiStudio,
  analyzeWithGoogleAiStudioComparison,
};
