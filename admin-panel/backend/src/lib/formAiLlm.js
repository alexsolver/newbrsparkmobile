'use strict';

const {
  normalizeSchemaDataFromLlm,
  normalizeProposalsFromLlm,
  sanitizeTemplateText,
  applyColumnSignalsToProposals,
  applyColumnSignalsToSchemaData,
} = require('./formAiNormalize');
const { resolveOpenAiCredentials } = require('./openAiCredentials');
const { formatColumnSignalsForLlm } = require('./formAiExtract');

const ANALYZE_SYSTEM_PROMPT = `És um assistente que analisa planilhas Excel convertidas em texto e prepara um formulário BrSpark (checklist no telemóvel).

Devolves APENAS JSON válido (sem markdown), com as chaves:
- "title": título provisório do formulário (pt-BR, curto).
- "description": descrição curta ou vazio.
- "items": array ORDENADO de blocos, na mesma ordem lógica do documento (folhas, colunas, secções).

Cada elemento de "items" é um objeto com:
- "key": identificador estável único no array (ex.: "i0", "i1"…).
- "kind": "section_break" OU "field".
- "label": texto em português — para campos, DEVE coincidir com o cabeçalho da coluna na planilha (mesmo nome), para o sistema alinhar o perfil estatístico.
- "context": opcional, uma frase (ex.: coluna «Estado» na folha «OS»).
- "recommendedOptionKey": a "key" da opção que achas mais adequada (deve existir em "options").
- "options": array com 3 a 5 opções clicáveis (tipos diferentes) para o utilizador confirmar.

Para kind "section_break", cada opção tem:
- "key": id único neste item
- "type": sempre "section_break"
- "multiple": false (etapa única) ou true (lista repetível / várias linhas iguais)
- "shortLabel": rótulo curto do botão (pt-BR)
- "hint": opcional

Para kind "field", cada opção tem:
- "key": id único neste item
- "type": um destes valores EXATOS: text, number, phone, email, date, checkbox, yes_no, dropdown, multiselect, rating, file_upload, photo, signature, location_pick, hidden
- "shortLabel": rótulo curto do botão
- "hint": opcional — porque este tipo encaixa nos dados

REGRAS DE TIPO (prioridade alta — lê também o bloco «Perfil estatístico das colunas» no input do utilizador):
- Se o perfil indicar signal=dropdown ou dropdown_weak para essa coluna: recommendedOptionKey DEVE ser a opção com type "dropdown"; preenche "suggestedOptions" com os valores listados no perfil (ou inferidos das linhas).
- Se signal=yes_no: recommendedOptionKey = opção "yes_no".
- Se signal=multiselect_hint (células com vários valores separados por vírgula ou ;): recommendedOptionKey = opção "multiselect" e suggestedOptions com os valores-atoma únicos.
- Se signal=email_hint / phone_hint / date_hint / number_hint: escolhe a opção desse tipo como recomendada.
- Coluna com os MESMOS textos a repetir-se muitas vezes (poucos distintos) NÃO é "text" — é quase sempre "dropdown" ou "yes_no".
- Exemplo: cabeçalho «Prioridade» com células só «Alta», «Média», «Baixa» → dropdown com suggestedOptions "Alta, Média, Baixa".
- Exemplo: «Conforme?» com só «Sim» e «Não» → yes_no.

"suggestedOptions": string com valores separados por vírgula para dropdown/multiselect (obrigatório quando recommended é dropdown ou multiselect).

Regras estruturais:
- Começa cada folha (## Folha:) com um section_break com label = nome da folha, depois os campos dessa folha.
- Se a primeira linha de cada folha for cabeçalho, um campo por coluna relevante (ignora colunas vazias ou totais óbvios).
- NÃO incluas kind field com type transit_start, transit_end, geofence_check, facial_recognition, barcode_scan, calculated.
`;

const SYSTEM_PROMPT = `És um assistente que gera formulários para a plataforma BrSpark (checklist no telemóvel).
Devolves APENAS JSON válido (sem markdown), com as chaves: "title", "description", "schemaData".

schemaData é um array ordenado de objetos. Cada objeto representa um campo OU um separador de etapa.

Tipos permitidos (usa exatamente estes valores em "type"):
- section_break: separador de etapa/página. Campos "label" = título da etapa. Opcional "multiple": true se a etapa for uma lista repetível (várias instâncias iguais).
- text: texto livre
- number: número
- phone: telefone
- email: e-mail
- date: data/hora
- checkbox: caixa de confirmação
- yes_no: sim/não toggle
- dropdown: lista — obrigatório preencher "options" como array de strings OU string "A, B, C"
- multiselect: várias opções — idem options
- rating: estrelas
- file_upload: anexo
- photo: fotografia
- signature: assinatura
- location_pick: GPS + mapa
- hidden: campo oculto (raramente)

NÃO uses transit_start, transit_end, geofence_check, facial_recognition, barcode_scan, calculated salvo pedido explícito no texto do utilizador.

Cada campo (exceto section_break) deve ter "label" claro em português (pt-BR), alinhado ao cabeçalho da coluna quando existir. Opcional: "required": true, "description": texto curto.

IDs: podes omitir "id" ou usar placeholders — o servidor corrige. Não repitas labels vazios.

Se o input incluir «Perfil estatístico das colunas», OBRIGA-TE a respeitar os signals: dropdown/yes_no/multiselect_hint têm prioridade sobre "text" para essas colunas; preenche "options" em dropdown/multiselect com os valores sugeridos no perfil quando existirem.

Se o input tiver várias folhas (## Folha:), começa cada folha com um section_break com label = nome da folha, depois os campos dessa folha.
Se a primeira linha de dados parecer cabeçalho de colunas, usa cada coluna como um campo.
Colunas onde os valores se repetem entre poucas etiquetas distintas devem ser "dropdown" ou "yes_no", não texto livre.
`;

async function openAiJsonObjectChat(systemPrompt, userContent, temperature = 0.25) {
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
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
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
 * Fase 1: analisar planilha e devolver itens com opções por botão (sem schema final).
 * @param {{ markdown: string, userHint?: string }} input
 */
function buildUserContentWithProfile(markdown, userHint, columnSignals) {
  const profileBlock = formatColumnSignalsForLlm(columnSignals || []);
  return (
    `Conteúdo extraído da planilha:\n\n` +
    String(markdown || '').slice(0, 130_000) +
    `\n\n### Perfil estatístico das colunas (linha 1 = cabeçalhos; confia nestes signals para o tipo de campo)\n` +
    profileBlock +
    `\n\n---\nInstruções extra do utilizador: ${String(userHint || '').trim() || '(nenhuma)'}\n`
  );
}

async function analyzeSpreadsheetProposals(input) {
  const userContent = buildUserContentWithProfile(
    input.markdown,
    input.userHint,
    input.columnSignals
  );

  const parsed = await openAiJsonObjectChat(ANALYZE_SYSTEM_PROMPT, userContent, 0.18);
  const title = sanitizeTemplateText(parsed.title, 200) || 'Formulário (IA)';
  const description = sanitizeTemplateText(parsed.description, 500);
  const { items, warnings: normWarnings } = normalizeProposalsFromLlm(parsed);
  const { items: itemsAdjusted, warnings: heurWarnings } = applyColumnSignalsToProposals(
    items,
    input.columnSignals || []
  );
  return { title, description, items: itemsAdjusted, warnings: [...normWarnings, ...heurWarnings] };
}

/**
 * @param {{ markdown: string, userHint?: string }} input
 * @returns {Promise<{ title: string, description: string, schemaData: object[], warnings: string[] }>}
 */
async function generateSchemaFromCanonical(input) {
  const userContent = buildUserContentWithProfile(
    input.markdown,
    input.userHint,
    input.columnSignals
  );

  const parsed = await openAiJsonObjectChat(SYSTEM_PROMPT, userContent, 0.22);
  const title = sanitizeTemplateText(parsed.title, 200) || 'Formulário gerado por IA';
  const description = sanitizeTemplateText(parsed.description, 500);
  const { schemaData, warnings } = normalizeSchemaDataFromLlm(parsed.schemaData);
  const { schemaData: schemaPatched, warnings: patchWarn } = applyColumnSignalsToSchemaData(
    schemaData,
    input.columnSignals || []
  );
  return { title, description, schemaData: schemaPatched, warnings: [...warnings, ...patchWarn] };
}

module.exports = {
  generateSchemaFromCanonical,
  analyzeSpreadsheetProposals,
  SYSTEM_PROMPT,
  ANALYZE_SYSTEM_PROMPT,
};
