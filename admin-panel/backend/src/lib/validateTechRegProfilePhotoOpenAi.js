'use strict';

/**
 * Validação por modelo multimodal (visão) para o **passo 1 do cadastro de prestador**.
 *
 * Isto não usa CompreFace, não usa `/api/vision/verify-face` e não substitui a biometria dos checklists.
 * Implementação atual: OpenAI. Previsto: alternativa ou fallback Google (Vertex / Vision API) no mesmo contrato
 * de saída (approved, userMessagePtBr, checks, rejectReasonsPtBr).
 */

const { resolveOpenAiCredentials } = require('./openAiCredentials');
const { openAiMessageContentToString, parseOpenAiJsonObject } = require('./openAiChatParse');

function detectBufferMime(buf) {
  if (!buf || buf.length < 12) return 'image/jpeg';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  const head = buf.slice(0, 12);
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

/**
 * Validação por IA (OpenAI visão) para foto inicial de cadastro de prestador.
 * @param {Buffer} imageBuffer
 * @returns {Promise<{
 *   approved: boolean,
 *   userMessagePtBr: string,
 *   checks: Record<string, boolean>,
 *   rejectReasonsPtBr: string[]
 * }>}
 */
async function validateTechRegProfilePhotoOpenAi(imageBuffer) {
  const { apiKey, model, baseUrl } = await resolveOpenAiCredentials();
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error(
      'Chave OpenAI ausente: configure a integração «OpenAI» no painel ou OPENAI_API_KEY no servidor.'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }

  const mime = detectBufferMime(imageBuffer);
  const b64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;

  const systemPrompt =
    'És um validador equilibrado de fotos para perfil profissional: o objetivo é aceitar fotos reais e utilizáveis, sem exigir estúdio. Em dúvida razoável sobre iluminação, nitidez ou óculos de grau, favorece APROVAÇÃO. Respondes APENAS com um objeto JSON válido, sem markdown nem texto fora do JSON.';

  const userText = `Analisa a imagem anexa. Contexto: cadastro de prestador de serviços numa app. Esta foto será usada como imagem de perfil do técnico e no fluxo de reconhecimento facial, para o cliente reconhecer o profissional no local.

Política: só rejeita quando a imagem é claramente inadequada. Não exijas iluminação de estúdio nem foco perfeito.

Critérios — approved só pode ser true se TODOS os checks forem true:
- singleClearHumanFace: exatamente um rosto humano real (não boneco, ilustração óbvia, foto de tela ilegível).
- fullFaceVisibleForRecognition: rosto suficientemente visível para identificação no dia a dia: testa, olhos e nariz reconhecíveis; pode haver leve corte de cabelo/chapéu se o rosto continua claramente identificável.
- noBlockingAccessories: ÓCULOS DE GRAU são sempre permitidos (armação fina ou grossa, lentes com anti-reflexo, leve tonalidade — conta como grau, não como sol). Só reprova acessórios que ESCONDEM o rosto para identificação: óculos de sol escuros/espelhados tipo “óculos de sol”, máscara em boca/nariz, viseira/capuz que cubra testa e olhos. Boné fino ou chapéu que não tape os olhos: permitido.
- sharpAndLit: aceita iluminação natural ou interior comum, sombras leves no rosto, e nitidez “boa o suficiente” para ver quem é. Reprova APENAS casos extremos: rosto quase invisível por escuridade, desfoque forte que impede ver olhos/nariz, ou tremor que torna o rosto ilegível. Se consegues identificar claramente a pessoa, sharpAndLit = true.
- appropriateContent: sem nudez explícita, violência gráfica, símbolos de ódio ou conteúdo claramente impróprio.

Regra extra: se estiveres indeciso entre reprovar por “luz baixa” ou “desfocado” mas o rosto ainda é reconhecível, marca os checks como true e approved true.

Responde JSON com este formato exato:
{"approved":boolean,"userMessagePtBr":"uma frase curta em português do Brasil para o usuário","checks":{"singleClearHumanFace":boolean,"fullFaceVisibleForRecognition":boolean,"noBlockingAccessories":boolean,"sharpAndLit":boolean,"appropriateContent":boolean},"rejectReasonsPtBr":[]}

Se approved for false, preenche rejectReasonsPtBr com 1 a 4 frases curtas em pt-BR.`;

  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + String(apiKey).trim(),
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
          ],
        },
      ],
    }),
  });

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    const err = new Error(`Resposta inválida do serviço de análise (HTTP ${res.status}).`);
    err.code = 'OPENAI_PARSE';
    throw err;
  }

  if (!res.ok) {
    const msg = data?.error?.message || rawText.slice(0, 280);
    const err = new Error(`Análise da imagem falhou: ${msg}`);
    err.code = 'OPENAI_HTTP';
    err.status = res.status;
    throw err;
  }

  const msg0 = data?.choices?.[0]?.message;
  if (msg0?.refusal) {
    const err = new Error('O modelo recusou analisar a foto de perfil.');
    err.code = 'OPENAI_REFUSAL';
    throw err;
  }
  const contentStr = openAiMessageContentToString(msg0?.content);
  if (!String(contentStr).trim()) {
    const err = new Error('Resposta da análise sem conteúdo.');
    err.code = 'OPENAI_EMPTY';
    throw err;
  }

  let parsed;
  try {
    parsed = parseOpenAiJsonObject(contentStr);
  } catch (e) {
    const err = new Error('Resultado da análise em formato inválido.');
    err.code = 'OPENAI_JSON';
    throw err;
  }

  const checks = parsed.checks && typeof parsed.checks === 'object' ? parsed.checks : {};
  const required = [
    'singleClearHumanFace',
    'fullFaceVisibleForRecognition',
    'noBlockingAccessories',
    'sharpAndLit',
    'appropriateContent',
  ];
  let allTrue = required.every((k) => checks[k] === true);
  let approved = parsed.approved === true && allTrue;

  const rejectReasonsPtBr = Array.isArray(parsed.rejectReasonsPtBr)
    ? parsed.rejectReasonsPtBr.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  if (!approved && rejectReasonsPtBr.length === 0) {
    rejectReasonsPtBr.push(
      String(parsed.userMessagePtBr || '').trim() || 'A imagem não cumpre os requisitos para foto de perfil.'
    );
  }

  const userMessagePtBr = String(parsed.userMessagePtBr || '').trim() || (approved ? 'Foto aceite.' : rejectReasonsPtBr[0]);

  if (parsed.approved === true && !allTrue) {
    approved = false;
    if (!rejectReasonsPtBr.length) {
      rejectReasonsPtBr.push('Um ou mais critérios técnicos não foram cumpridos. Tente outra foto.');
    }
  }

  return {
    approved,
    userMessagePtBr,
    checks: {
      singleClearHumanFace: checks.singleClearHumanFace === true,
      fullFaceVisibleForRecognition: checks.fullFaceVisibleForRecognition === true,
      noBlockingAccessories: checks.noBlockingAccessories === true,
      sharpAndLit: checks.sharpAndLit === true,
      appropriateContent: checks.appropriateContent === true,
    },
    rejectReasonsPtBr,
  };
}

module.exports = {
  validateTechRegProfilePhotoOpenAi,
  detectBufferMime,
};
