'use strict';

const {
  normalizeSchemaDataFromLlm,
  normalizeProposalsFromLlm,
  sanitizeTemplateText,
  applyColumnSignalsToProposals,
  applyColumnSignalsToSchemaData,
  normalizeStructureBlocksFromLlm,
  applyColumnSignalsToStructureBlocks,
  applyLabelHeuristicsToStructureBlocks,
} = require('./formAiNormalize');
const { resolveOpenAiCredentials } = require('./openAiCredentials');
const { formatColumnSignalsForLlm } = require('./formAiExtract');
const {
  formatAnalyzeFieldTypesForPrompt,
  formatSchemaTypeDocBlock,
  formatTransitDisplacementRulesForPrompt,
  formatAutomaticIconRulesForPrompt,
  buildFormContextBlock,
} = require('./formAiFieldCatalog');
const { sanitizeTaskIconName } = require('./formAiTemplateMetadataPatch');

/**
 * @param {Record<string, unknown>} [formContext]
 */
function buildAnalyzeSystemPrompt(formContext) {
  const typeList = formatAnalyzeFieldTypesForPrompt(formContext || {});
  return `Você é um assistente que analisa documentos (Excel, Word, PDF, texto vindo de OCR de imagem ou **JSON de formulários externos** já descrito em Markdown) e prepara um formulário BrSpark (checklist no celular).

Retorne APENAS JSON válido (sem markdown), com as chaves:
- "title": título provisório do formulário (pt-BR, curto).
- "description": descrição curta ou vazio.
- "items": array ORDENADO de blocos, na mesma ordem lógica do documento (folhas, colunas, seções).

Cada elemento de "items" é um objeto com:
- "key": identificador estável único no array (ex.: "i0", "i1"…).
- "kind": "section_break" OU "field".
- "label": texto em português — para campos, DEVE coincidir com o cabeçalho da coluna na planilha (mesmo nome), para o sistema alinhar o perfil estatístico.
- "context": opcional, uma frase (ex.: coluna "Estado" na planilha "OS").
- "recommendedOptionKey": a "key" da opção que você considera mais adequada (deve existir em "options").
- "options": array com 3 a 6 opções clicáveis (tipos diferentes) para o usuário confirmar.

Para kind "section_break", cada opção tem:
- "key": id único neste item
- "type": sempre "section_break"
- "multiple": false (etapa única) ou true (lista repetível / várias linhas iguais)
- "shortLabel": rótulo curto do botão (pt-BR)
- "hint": opcional

Para kind "field", cada opção tem:
- "key": id único neste item
- "type": um destes valores EXACTOS: ${typeList}
- "shortLabel": rótulo curto do botão
- "hint": opcional — porque este tipo encaixa nos dados

REGRAS DE TIPO (prioridade alta — leia também o bloco "Perfil estatístico das colunas" no input do usuário):
- Se o perfil indicar signal=dropdown ou dropdown_weak para essa coluna: recommendedOptionKey DEVE ser a opção com type "dropdown"; preenche "suggestedOptions" com os valores listados no perfil (ou inferidos das linhas).
- Se signal=yes_no: recommendedOptionKey = opção "yes_no".
- Se signal=multiselect_hint: recommendedOptionKey = opção "multiselect" e suggestedOptions com valores únicos.
- Se signal=email_hint / phone_hint / date_hint / number_hint: escolhe a opção desse tipo como recomendada.
- Se signal=barcode_hint: inclui opção "barcode_scan" e recomenda-a quando fizer sentido.
- Se signal=photo_hint: inclui "photo" ou "photo_stamped" (se o contexto do usuário pedir fotos carimbadas) como opções.
- Coluna com os MESMOS textos a repetir-se muitas vezes (poucos distintos) NÃO é "text" — é quase sempre "dropdown" ou "yes_no".

"suggestedOptions": string com valores separados por vírgula para dropdown/multiselect (obrigatório quando recommended é dropdown ou multiselect).

Regras estruturais:
- Comece cada planilha (## Folha:) com um section_break com label = nome da planilha, depois os campos dessa planilha.
- Se a primeira linha de cada planilha for cabeçalho, um campo por coluna relevante (ignora colunas vazias ou totais óbvios).
- Só usa tipos "avançados" (transit_*, geofence_check, facial_recognition, calculated) se estiverem na lista acima (contexto do administrador) ou se o usuário os pediu explicitamente no contexto.

${formatTransitDisplacementRulesForPrompt()}
`;
}

/**
 * IA só extrai estrutura (etapas + rótulos de colunas). Tipos de campo escolhe o usuário no painel.
 * @param {Record<string, unknown>} [_formContext] reservado (contexto já vai no user content)
 */
function buildStructureExtractSystemPrompt(_formContext) {
  const typeList = formatAnalyzeFieldTypesForPrompt(_formContext || {});
  return `Você é um assistente que lê documentos (Excel, Word, PDF ou texto de OCR de imagem) e extrai a ESTRUTURA lógica de um formulário BrSpark (checklist no celular).

Retorne APENAS JSON válido (sem markdown), com as chaves:
- "title": título provisório do formulário (pt-BR, curto).
- "description": descrição curta ou string vazia.
- "blocks": array ORDENADO na mesma ordem do documento (folhas, depois colunas relevantes).

Cada elemento de "blocks" tem:
- "key": identificador estável único no array (ex.: "b0", "b1"…).
- "kind": "section_break" OU "field".
- "label": texto em português — para field, usa o texto do cabeçalho da coluna na planilha (alinhado ao Excel).
- "context": opcional, uma frase curta (ex.: coluna "X" na planilha "Y").
- "suggestedType": OPCIONAL, só para kind=field, quando o rótulo for inequívoco. Use EXACTAMENTE um destes identificadores: ${typeList}
  Ex.: rótulo "Foto" ou "Imagem" → photo; "E-mail" → email; "Data" → date; "Telefone" → phone; "Assinatura" → signature; "Quantidade" → number; "Conforme?" / "Aprovado" → yes_no; "Código de barras" → barcode_scan; "Anexo" / "PDF" → file_upload.
  Se não tiver certeza, OMITA suggestedType (o painel aplica regras locais).

Não use "options", "recommendedOptionKey" nem "suggestedOptions".

Regras estruturais:
- O input pode ser planilha Excel (## Folha:), documento Word em Markdown, JSON textual, ou **JSON de Google Forms / Microsoft Forms / Typeform** já normalizado em Markdown — adapte a extração.
- Quando houver planilhas (## Folha:), comece cada uma com section_break (label = nome da folha), depois fields por coluna útil.
- Em listas numeradas ou títulos no Word/JSON, cada pergunta clara pode virar um field; agrupe sob section_break quando houver capítulos ou secções «Etapa».
- Se houver cabeçalho de tabela na primeira linha de uma grelha, um field por coluna (ignora vazias/totais óbvios).
- Mantenha a ordem de leitura natural (cima → baixo, esquerda → direita).

${formatTransitDisplacementRulesForPrompt()}
`;
}

function buildCanonicalSystemPrompt() {
  const typeDoc = formatSchemaTypeDocBlock();
  return `Você é um assistente que gera formulários para a plataforma BrSpark (checklist no celular).
Retorne APENAS JSON válido (sem markdown), com as chaves: "title", "description", "schemaData" e opcionalmente "metadata".

schemaData é um array ordenado de objetos. Cada objeto representa um campo OU um separador de etapa.

Tipos permitidos em "type" (use exatamente estes identificadores):
${typeDoc}

- section_break: "label" = título da etapa; opcional "multiple": true para lista repetível.

O contexto do administrador (se existir) vem no início do conteúdo do usuário.

Cada campo (exceto section_break) deve ter "label" claro em português (pt-BR), alinhado ao cabeçalho da coluna quando existir. Opcional: "required": true, "description": texto curto.

IDs: pode omitir "id" ou usar placeholders — o servidor corrige. Não repita labels vazios.

Se o input incluir "Perfil estatístico das colunas", respeita os signals: dropdown/yes_no/multiselect_hint têm prioridade sobre "text"; barcode_hint → barcode_scan; photo_hint → photo ou photo_stamped.

O texto pode vir de Excel, Word (Markdown) ou JSON — adapte: listas e cabeçalhos viram campos; use section_break para capítulos ou folhas (## Folha: no Excel).

Se o input tiver várias planilhas (## Folha:), comece cada planilha com um section_break com label = nome da planilha, depois os campos dessa planilha.
Colunas onde os valores se repetem entre poucas etiquetas distintas devem ser "dropdown" ou "yes_no", não texto livre.

${formatAutomaticIconRulesForPrompt()}

"metadata" (opcional): objeto \`{ "icon": "<Ionicons kebab-case>" }\` — ícone da tarefa na lista do painel; alinhe ao "title".

${formatTransitDisplacementRulesForPrompt()}
`;
}

async function openAiJsonObjectChat(systemPrompt, userContent, temperature = 0.25) {
  const { apiKey: key, model, baseUrl } = await resolveOpenAiCredentials();
  if (!key || !String(key).trim()) {
    const err = new Error(
      'Chave OpenAI ausente: configure a integração "OpenAI" em Integrações no painel ou defina OPENAI_API_KEY no servidor.'
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
 * @param {{ markdown: string, userHint?: string, columnSignals?: object[], formContext?: Record<string, unknown>, sourceFormat?: string }} input
 */
function buildUserContentWithProfile(input) {
  const profileBlock = formatColumnSignalsForLlm(input.columnSignals || []);
  const ctxBlock = buildFormContextBlock(input.formContext || {});
  const fmt = String(input.sourceFormat || 'xlsx').toLowerCase();
  const contentTitle =
    fmt === 'docx'
      ? 'Conteúdo extraído do documento Word:'
      : fmt === 'json_google_forms'
        ? 'Conteúdo normalizado a partir de JSON (Google Forms ou API compatível):'
        : fmt === 'json_ms_forms'
          ? 'Conteúdo normalizado a partir de JSON (estrutura tipo Microsoft Forms / lista de perguntas):'
          : fmt === 'json_typeform'
            ? 'Conteúdo normalizado a partir de JSON (Typeform ou API semelhante):'
            : fmt === 'json_external_form'
              ? 'Conteúdo normalizado a partir de JSON de formulário de outro sistema:'
              : fmt === 'json'
                ? 'Conteúdo extraído / representado a partir do JSON:'
                : fmt === 'pdf'
                  ? 'Conteúdo extraído do documento PDF:'
                  : fmt === 'image_ocr'
                    ? 'Conteúdo reconhecido por OCR na imagem do formulário:'
                    : 'Conteúdo extraído da planilha:';
  const profileHeading =
    fmt === 'xlsx' || fmt === 'xlsm'
      ? '### Perfil estatístico das colunas (linha 1 = cabeçalhos; confia nestes signals para o tipo de campo)'
      : '### Perfil estatístico (só aplica a Excel; em Word/PDF/imagem/JSON use o texto acima)';
  const externalJsonHint =
    fmt === 'json_google_forms' ||
    fmt === 'json_ms_forms' ||
    fmt === 'json_typeform' ||
    fmt === 'json_external_form'
      ? '\n\n### Nota sobre a origem (JSON de outro sistema)\n' +
        'O texto acima foi **normalizado automaticamente** a partir de um JSON exportado (Google Forms, Microsoft Forms, Typeform ou lista genérica de campos). **Não** copie identificadores técnicos da ferramenta de origem para o BrSpark. Cada «Pergunta» / «Campo» deve virar um `field` com `label` em pt-BR quando possível; quebras de página / capítulos → `section_break`. Use `suggestedType` quando o tipo original for óbvio (escolha única com poucas opções → `dropdown` ou `yes_no`; várias escolhas → `multiselect`; texto curto → `text`; parágrafo → `text`; escala numérica → `rating`; data → `date`; arquivo → `file_upload`).\n'
      : '';
  return (
    (ctxBlock ? ctxBlock + '\n\n' : '') +
    `${contentTitle}\n\n` +
    String(input.markdown || '').slice(0, 130_000) +
    externalJsonHint +
    `\n\n${profileHeading}\n` +
    profileBlock +
    `\n\n---\nInstruções extra do usuário: ${String(input.userHint || '').trim() || '(nenhuma)'}\n`
  );
}

/**
 * @param {{ markdown: string, userHint?: string, columnSignals?: object[], formContext?: Record<string, unknown> }} input
 */
async function analyzeSpreadsheetProposals(input) {
  const formContext = input.formContext && typeof input.formContext === 'object' ? input.formContext : {};
  const systemPrompt = buildAnalyzeSystemPrompt(formContext);
  const userContent = buildUserContentWithProfile({
    markdown: input.markdown,
    userHint: input.userHint,
    columnSignals: input.columnSignals,
    formContext,
    sourceFormat: input.sourceFormat,
  });

  const parsed = await openAiJsonObjectChat(systemPrompt, userContent, 0.18);
  const title = sanitizeTemplateText(parsed.title, 200) || 'Formulário (IA)';
  const description = sanitizeTemplateText(parsed.description, 500);
  const { items, warnings: normWarnings } = normalizeProposalsFromLlm(parsed, formContext);
  const { items: itemsAdjusted, warnings: heurWarnings } = applyColumnSignalsToProposals(
    items,
    input.columnSignals || [],
    formContext
  );
  return { title, description, items: itemsAdjusted, warnings: [...normWarnings, ...heurWarnings] };
}

/**
 * Análise só de estrutura: seções + campos (rótulos). Tipos escolhidos no builder.
 * @param {{ markdown: string, userHint?: string, columnSignals?: object[], formContext?: Record<string, unknown> }} input
 */
async function analyzeSpreadsheetStructure(input) {
  const formContext = input.formContext && typeof input.formContext === 'object' ? input.formContext : {};
  const systemPrompt = buildStructureExtractSystemPrompt(formContext);
  const userContent = buildUserContentWithProfile({
    markdown: input.markdown,
    userHint: input.userHint,
    columnSignals: input.columnSignals,
    formContext,
    sourceFormat: input.sourceFormat,
  });
  const parsed = await openAiJsonObjectChat(systemPrompt, userContent, 0.15);
  const title = sanitizeTemplateText(parsed.title, 200) || 'Formulário (IA)';
  const description = sanitizeTemplateText(parsed.description, 500);
  const { blocks, warnings: normWarnings } = normalizeStructureBlocksFromLlm(parsed);
  const blocksHinted = applyColumnSignalsToStructureBlocks(blocks, input.columnSignals || [], formContext);
  const blocksFinal = applyLabelHeuristicsToStructureBlocks(blocksHinted, formContext);
  return { title, description, blocks: blocksFinal, warnings: normWarnings };
}

/**
 * @param {{ markdown: string, userHint?: string, columnSignals?: object[], formContext?: Record<string, unknown> }} input
 * @returns {Promise<{ title: string, description: string, schemaData: object[], metadata?: { icon: string }, warnings: string[] }>}
 */
async function generateSchemaFromCanonical(input) {
  const formContext = input.formContext && typeof input.formContext === 'object' ? input.formContext : {};
  const systemPrompt = buildCanonicalSystemPrompt();
  const userContent = buildUserContentWithProfile({
    markdown: input.markdown,
    userHint: input.userHint,
    columnSignals: input.columnSignals,
    formContext,
    sourceFormat: input.sourceFormat,
  });

  const parsed = await openAiJsonObjectChat(systemPrompt, userContent, 0.22);
  const title = sanitizeTemplateText(parsed.title, 200) || 'Formulário gerado por IA';
  const description = sanitizeTemplateText(parsed.description, 500);
  const { schemaData, warnings } = normalizeSchemaDataFromLlm(parsed.schemaData);
  const { schemaData: schemaPatched, warnings: patchWarn } = applyColumnSignalsToSchemaData(
    schemaData,
    input.columnSignals || [],
    formContext
  );
  let metadata = {};
  const rawMeta = parsed.metadata;
  if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
    const ic = sanitizeTaskIconName(rawMeta.icon);
    if (ic) metadata = { icon: ic };
  }
  if (!metadata.icon) {
    const fb = sanitizeTaskIconName('clipboard-outline');
    if (fb) metadata = { icon: fb };
  }
  return {
    title,
    description,
    schemaData: schemaPatched,
    metadata,
    warnings: [...warnings, ...patchWarn],
  };
}

module.exports = {
  generateSchemaFromCanonical,
  analyzeSpreadsheetProposals,
  analyzeSpreadsheetStructure,
  buildAnalyzeSystemPrompt,
  buildStructureExtractSystemPrompt,
  buildCanonicalSystemPrompt,
  buildUserContentWithProfile,
  openAiJsonObjectChat,
};
