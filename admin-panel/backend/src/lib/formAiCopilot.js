'use strict';

const { resolveOpenAiCredentials } = require('./openAiCredentials');
const {
  buildFormContextBlock,
  formatSchemaTypeDocBlock,
  buildAnalyzeFieldTypesList,
} = require('./formAiFieldCatalog');
const { applySchemaPatch } = require('./formAiSchemaPatch');
const { normalizeLabelKey } = require('./formAiNormalize');

function buildCopilotSystemPrompt(formContext) {
  const typeDoc = formatSchemaTypeDocBlock();
  const fieldTypes = buildAnalyzeFieldTypesList(formContext || {}).join(', ');
  return `És o copiloto do Form Builder BrSpark (checklists no telemóvel). Ajudas a desenhar e corrigir formulários.

Tipos de campo suportados (referência):
${typeDoc}

Na fase de propostas por botão, tipos mais comuns para opções: ${fieldTypes}.

Responde sempre em português (pt-BR), claro e profissional.

Devolves APENAS JSON válido (sem markdown), com as chaves:
- "replyText": texto para o utilizador (explicações, dúvidas, resumo do que sugeriste).
- "schemaPatch": objeto com "operations" (array) OU null. Cada operação:
  - { "op": "add_field", "afterId": null ou id de campo antes do qual inserir (omitir ou null = fim), "field": { "type", "label", "required"?: bool, "options"?: string, "description"?: string } }
  - { "op": "update_field", "id": "<field_id>", "patch": { "label"?, "type"?, "required"?, "options"?, "description"? } }
  - { "op": "remove_field", "id": "<field_id>" } — só se o utilizador pedir remoção explícita.
- "logicSuggestions": array OU null. Cada entrada: { "monitorLabel": "rótulo do campo SE", "operator": "==" | "!=" | "contains", "value": "valor comparado", "targetLabel": "rótulo do campo alvo", "actionType": "SHOW" | "HIDE" | "REQUIRE" | "OPTIONAL" }.
  Usa rótulos exactos ou muito próximos dos que aparecem no schema. Não inventes rótulos que não existam.

Se só estiveres a responder uma dúvida sem alterar o formulário, usa schemaPatch: null e logicSuggestions: null.
Não cries campos duplicados com o mesmo rótulo sem o utilizador pedir.
`;
}

function compactSchemaForPrompt(schemaData, maxChars = 55000) {
  if (!Array.isArray(schemaData)) return '[]';
  const lite = schemaData.map((f) => {
    if (!f || typeof f !== 'object') return null;
    return {
      id: f.id,
      type: f.type,
      label: f.label,
      required: !!f.required,
      options: f.options != null ? String(f.options).slice(0, 200) : undefined,
    };
  });
  let s = JSON.stringify(lite.filter(Boolean));
  if (s.length > maxChars) s = s.slice(0, maxChars) + '…[truncado]';
  return s;
}

async function openAiCopilotJson(systemPrompt, messages, temperature = 0.32) {
  const { apiKey: key, model, baseUrl } = await resolveOpenAiCredentials();
  if (!key || !String(key).trim()) {
    const err = new Error(
      'Chave OpenAI em falta: configure a integração «OpenAI» em Integrações no painel, ou defina OPENAI_API_KEY no servidor.'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }
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
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Resposta OpenAI inválida (HTTP ${res.status}): ${rawText.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || rawText.slice(0, 300);
    throw new Error(`OpenAI: ${msg}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Resposta OpenAI sem conteúdo JSON.');
  }
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error('JSON devolvido pelo modelo é inválido: ' + e.message);
  }
}

/**
 * @param {object[]} rawList
 * @param {object[]} schemaData
 */
function mapLogicSuggestions(rawList, schemaData) {
  if (!Array.isArray(rawList) || !rawList.length) return { suggestions: [], warnings: [] };
  const fields = (schemaData || []).filter((f) => f && f.type && f.type !== 'section_break');
  const byNorm = new Map();
  for (const f of fields) {
    byNorm.set(normalizeLabelKey(f.label), f);
  }
  const suggestions = [];
  const warnings = [];
  let i = 0;
  for (const s of rawList) {
    if (!s || typeof s !== 'object') continue;
    const mon = byNorm.get(normalizeLabelKey(s.monitorLabel || s.condLabel));
    const tgt = byNorm.get(normalizeLabelKey(s.targetLabel));
    if (!mon || !tgt) {
      warnings.push(`Lógica #${i + 1}: rótulo monitor ou alvo não encontrado no schema.`);
      i++;
      continue;
    }
    const op = String(s.operator || '==').trim();
    const actionType = String(s.actionType || 'SHOW').toUpperCase();
    const allowed = new Set(['SHOW', 'HIDE', 'REQUIRE', 'OPTIONAL']);
    suggestions.push({
      monitorFieldId: mon.id,
      monitorLabel: mon.label,
      operator: op,
      value: s.value != null ? String(s.value) : '',
      targetFieldId: tgt.id,
      targetLabel: tgt.label,
      actionType: allowed.has(actionType) ? actionType : 'SHOW',
    });
    i++;
  }
  return { suggestions, warnings };
}

/**
 * @param {{
 *   messages: { role: string, content: string }[],
 *   schemaData?: object[],
 *   formContext?: Record<string, unknown>,
 *   spreadsheetSummary?: string,
 * }} input
 */
async function runFormCopilot(input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const schemaData = Array.isArray(input.schemaData) ? input.schemaData : [];
  const formContext = input.formContext && typeof input.formContext === 'object' ? input.formContext : {};

  const systemBase = buildCopilotSystemPrompt(formContext);
  const ctxBlock = buildFormContextBlock(formContext);
  const summary =
    input.spreadsheetSummary && String(input.spreadsheetSummary).trim()
      ? String(input.spreadsheetSummary).trim().slice(0, 12_000)
      : '';

  const systemPrompt =
    systemBase +
    (ctxBlock ? '\n\n' + ctxBlock : '') +
    (summary ? `\n\n### Resumo da planilha (se aplicável)\n${summary}` : '') +
    '\n\n### Estado actual do formulário (JSON compacto)\n' +
    compactSchemaForPrompt(schemaData);

  const bounded = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .slice(-18)
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 14_000),
    }));

  const parsed = await openAiCopilotJson(systemPrompt, bounded, 0.32);

  const replyText =
    typeof parsed.replyText === 'string' && parsed.replyText.trim()
      ? parsed.replyText.trim()
      : 'Sem texto de resposta.';

  const warnings = [];
  let schemaPatch =
    parsed.schemaPatch && typeof parsed.schemaPatch === 'object' ? parsed.schemaPatch : null;
  let schemaDataAfter = schemaData;

  if (schemaPatch && Array.isArray(schemaPatch.operations) && schemaPatch.operations.length) {
    const { schemaData: next, warnings: w } = applySchemaPatch(schemaData, schemaPatch);
    schemaDataAfter = next;
    warnings.push(...w);
  } else {
    schemaPatch = null;
  }

  const { suggestions: logicSuggestions, warnings: lw } = mapLogicSuggestions(
    parsed.logicSuggestions,
    schemaDataAfter
  );
  warnings.push(...lw);

  return {
    replyText,
    schemaPatch,
    schemaData: schemaDataAfter,
    logicSuggestions,
    warnings,
  };
}

/**
 * Sugestão focada só em regras (gatilhos) — formato alinhado ao modal de lógica do builder.
 * @param {object[]} schemaData
 * @param {string} userGoal
 * @param {Record<string, unknown>} [formContext]
 */
async function suggestLogicRules(schemaData, userGoal, formContext = {}) {
  const typeDoc = formatSchemaTypeDocBlock();
  const ctxBlock = buildFormContextBlock(formContext);
  const systemPrompt = `És especialista em regras condicionais do Form Builder BrSpark.
Cada regra no app: monitoriza um campo (ou cronómetro); SE condição; ENTÃO acções (mostrar/ocultar/tornar obrigatório).

Tipos de campo (referência): ${typeDoc}

Devolves APENAS JSON válido:
{
  "replyText": "explicação curta em pt-BR",
  "logicSuggestions": [
    { "monitorLabel": "rótulo do campo que dispara", "operator": "==", "value": "valor", "targetLabel": "rótulo do campo afectado", "actionType": "SHOW" | "HIDE" | "REQUIRE" | "OPTIONAL" }
  ]
}
Usa rótulos que existam no schema. Se não houver sugestões úteis, logicSuggestions: [].

${ctxBlock ? '\n' + ctxBlock : ''}`;

  const userContent =
    `Objectivo / pedido do administrador:\n${String(userGoal || '').trim().slice(0, 4000)}\n\n` +
    `Schema actual (JSON compacto):\n${compactSchemaForPrompt(schemaData)}`;

  const parsed = await openAiCopilotJson(
    systemPrompt,
    [{ role: 'user', content: userContent }],
    0.22
  );
  const replyText =
    typeof parsed.replyText === 'string' && parsed.replyText.trim()
      ? parsed.replyText.trim()
      : '';
  const { suggestions: logicSuggestions, warnings } = mapLogicSuggestions(
    parsed.logicSuggestions,
    schemaData
  );
  return { replyText, logicSuggestions, warnings };
}

module.exports = {
  runFormCopilot,
  suggestLogicRules,
  buildCopilotSystemPrompt,
  compactSchemaForPrompt,
  mapLogicSuggestions,
};
