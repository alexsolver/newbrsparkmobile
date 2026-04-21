'use strict';

const { resolveOpenAiCredentials } = require('./openAiCredentials');

/** Só chamadas `openAiCopilotJson` (copiloto + regras); resto da app usa `resolveOpenAiCredentials().model`. */
const COPILOT_CHAT_MODEL_DEFAULT = 'gpt-4o';
const {
  buildFormContextBlock,
  mergeFormContextWithSchemaInference,
} = require('./formAiFieldCatalog');
const { mapLogicSuggestions } = require('./formAiCopilotLogicMap');
const {
  MAX_VISION_SIMNAO_QUESTIONS,
  MAX_VISION_CHECKLIST_QUESTIONS,
  MAX_VISION_STRUCTURED_PROMPT_CHARS,
} = require('../constants/visionSimNaoQuestions');

function compactSchemaForPrompt(schemaData, maxChars = 55000) {
  if (!Array.isArray(schemaData)) return '[]';
  const lite = schemaData.map((f) => {
    if (!f || typeof f !== 'object') return null;
    const o = {
      id: f.id,
      type: f.type,
      label: f.label,
      required: !!f.required,
    };
    if (f.options != null && String(f.options).trim()) o.options = String(f.options).slice(0, 220);
    if (f.description != null && String(f.description).trim()) o.description = String(f.description).slice(0, 160);
    if (f.icon != null && String(f.icon).trim()) o.icon = String(f.icon).trim();
    if (f.iconLibrary != null && String(f.iconLibrary).trim()) o.iconLibrary = String(f.iconLibrary).trim();
    if (f.iconColor != null && String(f.iconColor).trim()) o.iconColor = String(f.iconColor).trim();
    if (f.type === 'section_break') {
      if (f.multiple === true || f.multiple === 'true') o.multiple = true;
      if (f.sectionFillMode) o.sectionFillMode = String(f.sectionFillMode);
    }
    if (
      (f.type === 'vision_checklist' || f.type === 'vision_ai_analysis') &&
      f.visionStructuredPrompt != null &&
      String(f.visionStructuredPrompt).trim()
    ) {
      o.visionStructuredPrompt = String(f.visionStructuredPrompt)
        .trim()
        .slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
    }
    if (
      (f.type === 'vision_checklist' || f.type === 'vision_ai_analysis') &&
      Array.isArray(f.visionQuestions)
    ) {
      const maxQ = f.type === 'vision_checklist' ? MAX_VISION_CHECKLIST_QUESTIONS : MAX_VISION_SIMNAO_QUESTIONS;
      const textCap = f.type === 'vision_checklist' ? MAX_VISION_STRUCTURED_PROMPT_CHARS : 220;
      o.visionQuestions = f.visionQuestions
        .map((q) => ({
          id: String(q?.id || '').slice(0, 64),
          text: String(q?.text || '').slice(0, textCap),
        }))
        .filter((q) => q.text)
        .slice(0, maxQ);
    }
    if (
      (f.type === 'vision_checklist' || f.type === 'vision_ai_analysis') &&
      f.visionCaptureMode != null &&
      ['photo_only', 'video_only', 'photo_and_video'].includes(String(f.visionCaptureMode).trim())
    ) {
      o.visionCaptureMode = String(f.visionCaptureMode).trim();
    }
    if (f.type === 'vision_ai_analysis' && f.visionRating0To10Enabled === true) {
      o.visionRating0To10Enabled = true;
    }
    if (f.type === 'vision_ai_analysis' && f.visionShowAiResponseInForm === false) {
      o.visionShowAiResponseInForm = false;
    }
    if (f.type === 'lookup_select') {
      if (f.lookupSource) o.lookupSource = String(f.lookupSource);
      if (f.lookupPreset) o.lookupPreset = String(f.lookupPreset).slice(0, 80);
      if (f.lookupApiPath) o.lookupApiPath = String(f.lookupApiPath).slice(0, 240);
    }
    if (f.type === 'repeatable_matrix' && Array.isArray(f.matrixColumns)) {
      o.matrixColumns = f.matrixColumns
        .map((c) => ({
          id: String(c?.id || '').slice(0, 48),
          label: String(c?.label || '').slice(0, 120),
          cellType: String(c?.cellType || 'text'),
        }))
        .filter((c) => c.id && c.label)
        .slice(0, 8);
      if (f.matrixMinRows != null) o.matrixMinRows = String(f.matrixMinRows).slice(0, 8);
      if (f.matrixMaxRows != null) o.matrixMaxRows = String(f.matrixMaxRows).slice(0, 8);
    }
    if (f.type === 'opinion_scale') {
      if (f.opinionScaleMode) o.opinionScaleMode = String(f.opinionScaleMode).slice(0, 16);
    }
    if (f.type === 'image_annotation') {
      if (f.annotationPenColor) o.annotationPenColor = String(f.annotationPenColor).slice(0, 20);
      if (f.annotationStrokeWidth != null) o.annotationStrokeWidth = f.annotationStrokeWidth;
    }
    if (f.geofenceRadius != null && String(f.geofenceRadius) !== '') o.geofenceRadius = f.geofenceRadius;
    if (f.defaultValue != null && String(f.defaultValue).trim()) o.defaultValue = String(f.defaultValue).slice(0, 100);
    if (f.showFieldInstructions === true || f.showFieldInstructions === 'true') o.showFieldInstructions = true;
    if (f.requireOnlineValidation === true || f.requireOnlineValidation === 'true') o.requireOnlineValidation = true;
    if (f.allowTechnicianComment === true || f.allowTechnicianComment === 'true') o.allowTechnicianComment = true;
    if (f.allowMediaDescription === true || f.allowMediaDescription === 'true') o.allowMediaDescription = true;
    if (Array.isArray(f.rules) && f.rules.length) o.rulesCount = f.rules.length;
    return o;
  });
  let s = JSON.stringify(lite.filter(Boolean));
  if (s.length > maxChars) s = s.slice(0, maxChars) + '…[truncado]';
  return s;
}

/**
 * @param {string} systemPrompt
 * @param {{ role: string, content: string }[]} messages
 * @param {number} [temperature]
 * @param {{ maxTokens?: number }} [opts] — limite de conclusão (o copiloto devolve JSON grande; omissão = 16384)
 */
async function openAiCopilotJson(systemPrompt, messages, temperature = 0.32, opts = {}) {
  const creds = await resolveOpenAiCredentials();
  const key = creds.apiKey;
  const baseUrl = creds.baseUrl;
  const copilotModelEnv =
    process.env.OPENAI_COPILOT_MODEL != null && String(process.env.OPENAI_COPILOT_MODEL).trim()
      ? String(process.env.OPENAI_COPILOT_MODEL).trim()
      : '';
  /** Modelo da integração (ex.: gpt-4o-mini) não se aplica aqui — copiloto usa por defeito modelo mais capaz. */
  const model = copilotModelEnv || COPILOT_CHAT_MODEL_DEFAULT;
  if (!key || !String(key).trim()) {
    const err = new Error(
      'Chave OpenAI ausente: configure a integração "OpenAI" em Integrações no painel ou defina OPENAI_API_KEY no servidor.'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }
  const envMax = Number(process.env.OPENAI_COPILOT_MAX_COMPLETION_TOKENS || '');
  const cap =
    opts.maxTokens != null && opts.maxTokens > 0
      ? Math.min(Math.floor(opts.maxTokens), 32768)
      : Number.isFinite(envMax) && envMax > 0
        ? Math.min(envMax, 32768)
        : 16384;
  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key.trim(),
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: cap,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    const err = new Error(`Resposta OpenAI inválida (HTTP ${res.status}): ${rawText.slice(0, 200)}`);
    err.code = 'OPENAI_BAD_RESPONSE';
    throw err;
  }
  if (!res.ok) {
    const msg = data?.error?.message || rawText.slice(0, 300);
    const err = new Error(`OpenAI: ${msg}`);
    err.code = 'OPENAI_BAD_RESPONSE';
    throw err;
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    const err = new Error('Resposta OpenAI sem conteúdo JSON.');
    err.code = 'OPENAI_EMPTY_JSON';
    throw err;
  }
  try {
    return JSON.parse(content);
  } catch (e) {
    const err = new Error('JSON devolvido pelo modelo é inválido: ' + e.message);
    err.code = 'OPENAI_JSON_INVALID';
    throw err;
  }
}

/**
 * @param {object[]} schemaData
 * @param {string} userGoal
 * @param {Record<string, unknown>} [formContext]
 * @param {{ documentationFetchedText?: string, documentationFetchWarning?: string }} [docOpts]
 */
async function suggestLogicRules(schemaData, userGoal, formContext = {}, docOpts = {}) {
  const merged = mergeFormContextWithSchemaInference(formContext, schemaData);
  const ctxBlock = buildFormContextBlock(merged);
  const docText =
    docOpts.documentationFetchedText && String(docOpts.documentationFetchedText).trim()
      ? String(docOpts.documentationFetchedText).trim().slice(0, 36_000)
      : '';
  const docPromptSection = docText
    ? '\n\n### Conteúdo web de referência (lido pelo servidor)\n' +
      'Use para alinhar regras ao processo descrito. Pode incluir **API_FETCH** quando houver URL HTTPS válida e fluxo claro—**GET** na regra = URL fixo; variáveis via **POST** a endpoint próprio que leia `responses`.\n\n' +
      docText
    : '';
  const systemPrompt = `Você é especialista em regras condicionais do Form Builder BrSpark.
Cada regra no app: monitora um campo (ou cronômetro); SE condição; ENTÃO ações (mostrar/ocultar/tornar obrigatório).
Use apenas rótulos de campos que existam no JSON do schema enviado pelo usuário.
Campos transit_start e transit_end (deslocamento) ficam **sempre** no **início** do formulário (primeiro bloco operacional) e em par — não sugira regras nem textos que os coloquem no meio ou no final do fluxo.

**Operadores suportados nas sugestões:** o motor aceita comparações de texto, números (ex.: ">", "<=", "between" com valor **min|max**), vazio/preenchido, booleanos, listas (one_of, includes_any, …), regex (matches_regex), tamanho (length_*), contagem em resposta múltipla (count_*), datas (date_*) e tempos de formulário/etapa — use o mais simples que resolver o caso. **Não** existe regra direta por «km de deslocamento» só a partir de **transit_start** / **transit_end** como número mágico. Se o pedido exigir só isso, devolva **logicSuggestions: []** e em **replyText** explique o limite e **2 a 4 alternativas** viáveis.

Retorne APENAS JSON válido:
{
  "replyText": "explicação curta em pt-BR",
  "logicSuggestions": [
    { "monitorFieldId": "id_opcional", "monitorLabel": "rótulo do campo que dispara", "operator": "==", "value": "valor", "targetFieldId": "id_opcional", "targetLabel": "rótulo do campo afetado", "actionType": "SHOW" | "HIDE" | "REQUIRE" | "OPTIONAL" },
    { "monitorLabel": "CEP", "operator": "not_empty", "value": "", "targetLabel": "Cidade", "actionType": "API_FETCH", "apiMethod": "GET", "apiUrl": "https://api.exemplo.com/v1/cidade?cep=SUBSTITUIR", "apiResponsePath": "nome", "apiErrorMsg": "Não foi possível obter a cidade.", "apiAllowOffline": true }
  ]
}
Prefira **monitorFieldId** e **targetFieldId** do JSON compacto quando existirem; caso contrário use rótulos exatos. Para **API_FETCH**, **apiUrl** deve ser **https** ou **http** só em **localhost** / **127.0.0.1**; nunca inclua segredos. Se não houver sugestões úteis ou o pedido for incompatível com o motor, logicSuggestions: [].
${docPromptSection}
${ctxBlock ? '\n' + ctxBlock : ''}`;

  const userContent =
    `Objetivo / pedido do administrador:\n${String(userGoal || '').trim().slice(0, 4000)}\n\n` +
    `Schema atual (JSON compacto):\n${compactSchemaForPrompt(schemaData)}`;

  const parsed = await openAiCopilotJson(
    systemPrompt,
    [{ role: 'user', content: userContent }],
    0.22
  );
  const replyText =
    typeof parsed.replyText === 'string' && parsed.replyText.trim()
      ? parsed.replyText.trim()
      : '';
  const allWarnings = [];
  if (docOpts.documentationFetchWarning && String(docOpts.documentationFetchWarning).trim()) {
    allWarnings.push(String(docOpts.documentationFetchWarning).trim());
  }
  const { suggestions: logicSuggestions, warnings } = mapLogicSuggestions(
    parsed.logicSuggestions,
    schemaData
  );
  allWarnings.push(...warnings);
  return { replyText, logicSuggestions, warnings: allWarnings };
}

module.exports = {
  suggestLogicRules,
  compactSchemaForPrompt,
  mapLogicSuggestions,
  openAiCopilotJson,
};
