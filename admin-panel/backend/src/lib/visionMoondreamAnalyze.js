'use strict';

const prisma = require('../db');
const {
  normalizeVisionAnalyzeResponse,
  buildVisionSingleQuestionJsonExampleLines,
  VISION_SINGLE_STRUCTURED_DISCIPLINE,
  VISION_RATIONALE_LANGUAGE_BLOCK,
} = require('./visionChecklistAnalyze');

const MOONDREAM_INTEGRATION_NAME = 'Visão IA - Moondream';
const MOONDREAM_DEFAULT_BASE = 'https://api.moondream.ai/v1';
/** Limite documentado Moondream (imagens). */
const MAX_MOONDREAM_BYTES = 10 * 1024 * 1024;

function prismaWhereMoondreamIntegration() {
  return { type: 'VISION', name: MOONDREAM_INTEGRATION_NAME };
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeMoondreamBaseUrl(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/\/+$/g, '');
  if (!s) return MOONDREAM_DEFAULT_BASE;
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return MOONDREAM_DEFAULT_BASE;
    let path = u.pathname.replace(/\/+$/g, '');
    if (!path || path === '/') path = '/v1';
    return `${u.origin}${path}`;
  } catch {
    return MOONDREAM_DEFAULT_BASE;
  }
}

async function findMoondreamIntegration() {
  return prisma.integration.findFirst({
    where: prismaWhereMoondreamIntegration(),
  });
}

/**
 * Mesma instrução que `analyzeWithGoogleAiStudio` (Gemini), para saída JSON com answers + rationale
 * e opcionalmente rating0To10 na raiz.
 *
 * @param {{ id: string, text: string }[]} questions
 * @param {boolean} wantRating
 * @returns {string}
 */
function buildMoondreamGeminiAlignedInstruction(questions, wantRating) {
  const qBlock = questions.map((q) => `- id=${JSON.stringify(q.id)} — ${q.text}`).join('\n');
  const singleStructured = questions.length === 1;
  const q0 = questions[0];
  const q0id = String(q0?.id || 'q1').replace(/"/g, '');
  const jsonShapeSingle = singleStructured
    ? buildVisionSingleQuestionJsonExampleLines(q0id, wantRating)
    : '';
  const ratingRules =
    wantRating && singleStructured
      ? '\n\nNa raiz do JSON inclua "rating0To10": inteiro entre 0 e 10 (inclusivo), coerente com o critério do prompt, ou null se for impossível avaliar com segurança. Este campo é obrigatório na raiz (pode ser null).'
      : '';
  if (singleStructured) {
    return (
      VISION_RATIONALE_LANGUAGE_BLOCK +
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
    );
  }
  return (
    VISION_RATIONALE_LANGUAGE_BLOCK +
    'Analise a mídia anexa (imagem ou vídeo) e responda a cada pergunta abaixo com base apenas no que é visível.\n\n' +
    'Perguntas (use exatamente estes ids no campo questionId de cada resposta):\n' +
    qBlock +
    '\n\nResponda somente com JSON neste formato (sem markdown, sem texto fora do JSON):\n' +
    '{"answers":[{"questionId":"q1","value":"yes","confidence":0.74,"rationale":"Breve resumo em português do observado na imagem."}]}\n' +
    'value deve ser yes, no ou unknown (sempre em inglês). confidence entre 0 e 1 (evite 0,0 salvo imagem inútil). rationale: texto real em pt-BR, não placeholders. Inclua uma entrada em answers para cada pergunta.'
  );
}

/**
 * Compat.: prompt único (mesmo desenho que «Visão IA — análise» / Gemini).
 *
 * @param {string} criterionText
 * @returns {string}
 */
function buildMoondreamVisionDetectionPrompt(criterionText) {
  return buildMoondreamGeminiAlignedInstruction([{ id: 'q1', text: String(criterionText || '') }], false);
}

/**
 * @param {string} text
 * @returns {'yes' | 'no' | 'unknown'}
 */
/**
 * @param {string} rawText
 * @returns {Record<string, unknown> | null}
 */
function tryParseJsonFromMoondreamAnswer(rawText) {
  let t = String(rawText ?? '').trim();
  if (!t) return null;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/im);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeYesNoToken(text) {
  const s = String(text ?? '')
    .trim()
    .toLowerCase();
  if (!s) return 'unknown';
  const first = s.split(/[\s,.!?;:]+/).filter(Boolean)[0] || '';
  const t = first || s;
  if (t === 'yes' || t === 'sim' || t === 'true' || t === '1' || t === 'y' || t === 's') return 'yes';
  if (t === 'no' || t === 'não' || t === 'nao' || t === 'false' || t === '0' || t === 'n') return 'no';
  if (t === 'unknown' || t === 'indefinido' || t === 'indeterminado' || t === 'não sei' || t === 'nao sei')
    return 'unknown';
  if (/^(sim|não|nao)\b/i.test(s)) {
    return /^sim\b/i.test(s) ? 'yes' : 'no';
  }
  return 'unknown';
}

/**
 * @param {{ buffer: Buffer, mimetype?: string, questions: { id: string, text: string }[], integration: object, visionRating0To10?: boolean }} opts
 * @returns {Promise<{ ok: true, payload: object } | { ok: false, error: string }>}
 */
async function analyzeWithMoondream(opts) {
  const { buffer, questions, integration, visionRating0To10, mimetype } = opts;
  const wantRating = visionRating0To10 === true;
  const apiKey = String(integration.apiKey || '').trim();
  if (!apiKey) {
    return { ok: false, error: 'Integração Moondream sem API key configurada.' };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, error: 'Mídia vazia.' };
  }
  if (buffer.length > MAX_MOONDREAM_BYTES) {
    return {
      ok: false,
      error: 'Imagem acima do limite Moondream (10 MB). Reduza a resolução ou use vídeo mais curto (usa frame).',
    };
  }
  const mt = String(mimetype || 'image/jpeg').trim() || 'image/jpeg';
  if (!mt.startsWith('image/')) {
    return {
      ok: false,
      error: 'Moondream aceita apenas imagem neste fluxo. Para vídeo, o app já envia um frame JPEG.',
    };
  }

  const base = normalizeMoondreamBaseUrl(integration.baseUrl || '');
  const queryUrl = `${base.replace(/\/+$/g, '')}/query`;

  /** API cloud costuma responder em segundos; backend próprio em CPU pode levar vários minutos. */
  const timeoutMs =
    integration.metadata &&
    typeof integration.metadata === 'object' &&
    integration.metadata.timeoutMs != null
      ? Math.min(600_000, Math.max(15_000, parseInt(String(integration.metadata.timeoutMs), 10) || 300_000))
      : 300_000;

  const b64 = buffer.toString('base64');
  const image_url = `data:${mt};base64,${b64}`;

  const question = buildMoondreamGeminiAlignedInstruction(questions, wantRating);
  let res;
  let json;
  try {
    res = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moondream-Auth': apiKey,
      },
      body: JSON.stringify({ image_url, question }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: `Moondream HTTP ${res.status}: resposta não é JSON.`,
      };
    }
  } catch (e) {
    const name = e && e.name;
    const msg = e && e.message ? String(e.message) : String(e);
    const isTimeout = name === 'AbortError' || name === 'TimeoutError';
    return {
      ok: false,
      error: isTimeout ? 'Tempo esgotado ao contatar Moondream.' : msg,
    };
  }

  if (!res.ok) {
    const hint = json && (json.error || json.message) ? String(json.error || json.message) : '';
    return {
      ok: false,
      error: `Moondream HTTP ${res.status}${hint ? `: ${hint.slice(0, 200)}` : ''}`,
    };
  }

  const rawAns = json.answer != null ? String(json.answer) : '';
  const inner = tryParseJsonFromMoondreamAnswer(rawAns);
  if (inner && typeof inner === 'object' && !Array.isArray(inner) && Array.isArray(inner.answers)) {
    const synthetic = {
      requestId: json.request_id != null ? String(json.request_id) : undefined,
      rating0To10: inner.rating0To10,
      answers: inner.answers,
    };
    return normalizeVisionAnalyzeResponse(synthetic, questions, { visionRating0To10: wantRating });
  }

  /** Fallback: texto livre / modelo sem JSON — uma entrada por pergunta com heurística sim/não. */
  const requestId = json.request_id != null ? String(json.request_id) : undefined;
  if (questions.length === 1) {
    const q = questions[0];
    const yn = normalizeYesNoToken(rawAns);
    const synthetic = {
      requestId,
      answers: [
        {
          questionId: q.id,
          question: q.text,
          value: yn,
          confidence: yn !== 'unknown' ? 0.72 : 0.35,
          rationale: rawAns ? rawAns.slice(0, 800) : '',
        },
      ],
    };
    return normalizeVisionAnalyzeResponse(synthetic, questions, { visionRating0To10: wantRating });
  }

  const syntheticMulti = {
    requestId,
    answers: questions.map((q) => {
      const yn = normalizeYesNoToken(rawAns);
      return {
        questionId: q.id,
        question: q.text,
        value: yn,
        confidence: yn !== 'unknown' ? 0.72 : 0.35,
        rationale: rawAns ? rawAns.slice(0, 800) : '',
      };
    }),
  };
  return normalizeVisionAnalyzeResponse(syntheticMulti, questions, { visionRating0To10: wantRating });
}

module.exports = {
  MOONDREAM_INTEGRATION_NAME,
  prismaWhereMoondreamIntegration,
  normalizeMoondreamBaseUrl,
  findMoondreamIntegration,
  buildMoondreamGeminiAlignedInstruction,
  buildMoondreamVisionDetectionPrompt,
  analyzeWithMoondream,
};
