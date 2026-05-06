'use strict';

const {
  buildFormContextBlock,
  mergeFormContextWithSchemaInference,
} = require('../formAiFieldCatalog');
const {
  compactTemplateSettingsForPrompt,
} = require('../formAiSettingsPatch');
const {
  compactTemplateMetadataForPrompt,
} = require('../formAiTemplateMetadataPatch');
const { applyCopilotParsedPayload } = require('../formAiCopilotApply');
const { openAiCopilotJson, compactSchemaForPrompt } = require('../formAiCopilot');
const { buildNextSystemPrompt } = require('./buildNextSystemPrompt');
const { buildMandatoryOutlinePromptBlock, extractDocumentOutlineForCopilot } = require('./extractDocOutlineForCopilot');
const {
  isDocMirrorTooThin,
  buildDocMirrorRepairUserMessage,
} = require('./copilotDocMirrorRepair');

/** @param {unknown} v */
function normText(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * @param {object} f
 * @returns {boolean}
 */
function isConformityDropdown(f) {
  if (!f || String(f.type || '') !== 'dropdown') return false;
  const opts = normText(f.options);
  if (!opts) return false;
  return opts.includes('conforme') && (opts.includes('nao conforme') || opts.includes('não conforme'));
}

/**
 * @param {object} f
 * @returns {boolean}
 */
function isCriticalNumberField(f) {
  if (!f || String(f.type || '') !== 'number') return false;
  const label = normText(f.label);
  return /(risco|score|critic|nao conform|não conform|\\bnc\\b|quantidade.*nc|contagem)/.test(label);
}

/**
 * @param {object} f
 * @returns {boolean}
 */
function requiresSequentialEvidenceField(f) {
  const t = String(f && f.type ? f.type : '');
  if (!t) return false;
  if (t === 'yes_no' || t === 'rating') return true;
  if (isConformityDropdown(f)) return true;
  if (isCriticalNumberField(f)) return true;
  return false;
}

/**
 * @param {object} f
 * @returns {boolean}
 */
function isEvidenceField(f) {
  const t = String(f && f.type ? f.type : '');
  return ['photo', 'photo_stamped', 'file_upload', 'image_annotation'].includes(t);
}

/**
 * @param {object[]} prevSchema
 * @param {object[]} nextSchema
 * @returns {string[]}
 */
function collectTouchedDecisionFieldIds(prevSchema, nextSchema) {
  const prevMap = new Map();
  for (const f of prevSchema || []) {
    if (!f || !f.id) continue;
    prevMap.set(String(f.id), f);
  }
  const touched = [];
  for (const f of nextSchema || []) {
    if (!f || !f.id) continue;
    const id = String(f.id);
    if (!requiresSequentialEvidenceField(f)) continue;
    const prev = prevMap.get(id);
    if (!prev) {
      touched.push(id);
      continue;
    }
    const changed =
      String(prev.type || '') !== String(f.type || '') ||
      String(prev.label || '') !== String(f.label || '') ||
      String(prev.options || '') !== String(f.options || '');
    if (changed) touched.push(id);
  }
  return [...new Set(touched)];
}

/**
 * @param {object[]} schemaData
 * @param {string[]} targetIds
 * @returns {{ id: string, label: string, type: string, nextId: string, nextType: string, nextRequired: boolean }[]}
 */
function findMissingSequentialEvidence(schemaData, targetIds) {
  if (!Array.isArray(schemaData) || !Array.isArray(targetIds) || !targetIds.length) return [];
  const targetSet = new Set(targetIds.map((x) => String(x)));
  const out = [];
  for (let i = 0; i < schemaData.length; i += 1) {
    const f = schemaData[i];
    if (!f || !f.id) continue;
    const id = String(f.id);
    if (!targetSet.has(id)) continue;
    const n = schemaData[i + 1];
    const ok = !!(n && isEvidenceField(n) && n.required === true);
    if (!ok) {
      out.push({
        id,
        label: String(f.label || ''),
        type: String(f.type || ''),
        nextId: n && n.id ? String(n.id) : '',
        nextType: n && n.type ? String(n.type) : '',
        nextRequired: !!(n && n.required === true),
      });
    }
  }
  return out;
}

/**
 * @param {{ id: string, label: string, type: string, nextId: string, nextType: string, nextRequired: boolean }[]} miss
 * @returns {string}
 */
function buildSequentialEvidenceRepairUserMessage(miss) {
  const lines = (miss || [])
    .slice(0, 30)
    .map(
      (m, i) =>
        `${i + 1}. id=${m.id} | tipo=${m.type} | label="${m.label}" | next=${m.nextId || '(nenhum)'}:${m.nextType || '-'}:required=${m.nextRequired}`
    )
    .join('\n');
  return (
    '## VALIDADOR AUTOMATICO - regra de evidencia sequencial REJEITADA\n\n' +
    'A proposta nao cumpriu a regra critica: todo campo de decisao criado/alterado (`yes_no`, `dropdown` de conformidade, `rating`, `number` critico) deve ter **logo abaixo** um campo de evidencia (`photo`/`photo_stamped`/`file_upload`/`image_annotation`) com `required: true`.\n\n' +
    'Campos sem evidencia sequencial obrigatoria detectados:\n' +
    lines +
    '\n\n' +
    'Corrija agora com `schemaPatch` (apenas `add_field`, `update_field`, `remove_field`), preservando ids existentes sempre que possivel. Nao responda so com texto: devolva JSON com patch aplicavel.'
  );
}

/**
 * @param {string} docText
 * @returns {boolean}
 */
function isRegulatoryNormDocument(docText) {
  const t = normText(docText);
  if (!t) return false;
  return (
    t.includes('norma regulamentadora') ||
    t.includes('nr-') ||
    t.includes(' nr ') ||
    t.includes('comissao interna de prevencao de acidentes') ||
    t.includes('comissão interna de prevenção de acidentes')
  );
}

/**
 * @param {object[]} schemaData
 * @returns {boolean}
 */
function isRegulatorySchemaTooGeneric(schemaData) {
  const schema = Array.isArray(schemaData) ? schemaData : [];
  if (!schema.length) return true;
  const sections = schema.filter((f) => f && f.type === 'section_break').length;
  const structured = schema.filter((f) =>
    f && ['yes_no', 'dropdown', 'multiselect', 'repeatable_matrix', 'number', 'rating', 'date', 'photo', 'file_upload'].includes(String(f.type || ''))
  ).length;
  const genericYesNoNr = schema.filter((f) => {
    if (!f || String(f.type || '') !== 'yes_no') return false;
    const lbl = normText(f.label);
    return /conforme.*nr|nr.*conforme/.test(lbl);
  }).length;

  // Padrão reprovado: pouca estrutura + pergunta única genérica de conformidade NR.
  if (sections < 5 && structured < 12) return true;
  if (genericYesNoNr >= 1 && structured < 14) return true;
  return false;
}

/**
 * @returns {string}
 */
function buildRegulatoryDepthRepairUserMessage() {
  return (
    '## VALIDADOR AUTOMATICO - profundidade regulatoria REJEITADA\n\n' +
    'A proposta esta generica para documento normativo (NR). Nao pode ficar em pergunta unica do tipo “esta conforme a NR?” com poucas secoes.\n\n' +
    'Requisitos obrigatorios desta correcao:\n' +
    '1) Espelhar os capitulos do documento em `section_break` tematicos (nao usar labels genericos como “Etapa 1”).\n' +
    '2) Em cada tema, criar criterios verificaveis (nao apenas `text` livre).\n' +
    '3) Para campos de decisao (`yes_no`, `dropdown` de conformidade, `rating`, `number` critico), incluir evidencia sequencial obrigatoria.\n' +
    '4) Incluir rastreabilidade minima (identificacao, data tipo `date`, responsavel, evidencia, assinatura).\n' +
    '5) Entregar `schemaPatch` substancial (nao apenas micro-ajustes).\n\n' +
    'Devolva JSON com patch aplicavel.'
  );
}

/**
 * Deteta clarifyOptions focado em "tipo de campo" (pergunta evitável na maioria dos casos).
 * @param {{ id: string, question: string, choices: { id: string, label: string }[] }[]} clarifyOptions
 * @returns {boolean}
 */
function isFieldTypeClarification(clarifyOptions) {
  if (!Array.isArray(clarifyOptions) || !clarifyOptions.length) return false;
  const qText = clarifyOptions
    .map((q) => normText(q && q.question))
    .join(' | ');
  const cText = clarifyOptions
    .flatMap((q) => (Array.isArray(q && q.choices) ? q.choices : []))
    .map((c) => normText(c && c.label))
    .join(' | ');

  const asksType =
    /(tipo de campo|tipo do campo|qual tipo|field type|tipo de resposta|yes_no|dropdown|multiselect|checkbox|text|number|rating|date)/.test(
      qText
    ) ||
    /(texto livre|multipla escolha|resposta unica|sim\/nao|sim nao|numero|data)/.test(cText);
  return asksType;
}

/**
 * @returns {string}
 */
function buildNoTypeClarifyRepairUserMessage() {
  return (
    '## CORRECAO AUTOMATICA - sem entrevista de tipo de campo\n\n' +
    'Nao pergunte tipo de campo ao administrador neste caso.\n' +
    'Com base no contexto, infira automaticamente o tipo ideal de cada pergunta e entregue patch completo agora.\n\n' +
    'Regras obrigatorias:\n' +
    '1) Persona especialista autoajustada ao dominio do material.\n' +
    '2) Extrair requisitos e desdobrar em campos verificaveis.\n' +
    '3) Inferir tipos automaticamente por padrao.\n' +
    '4) So usar clarifyOptions se houver ambiguidade tecnica real e bloqueante.\n' +
    '5) Entregar schemaPatch substancial nesta resposta.\n\n' +
    'Devolva JSON aplicavel.'
  );
}

/**
 * @param {unknown} schemaPatch
 * @param {unknown} settingsPatch
 * @param {unknown} templateMetadataPatch
 * @param {unknown} templateTitlePatch
 * @param {unknown} logicSuggestions
 * @param {{ includeLogic?: boolean }} [opts]
 * @returns {boolean}
 */
function hasAnyConcreteChange(
  schemaPatch,
  settingsPatch,
  templateMetadataPatch,
  templateTitlePatch,
  logicSuggestions,
  opts = {}
) {
  const includeLogic = opts && opts.includeLogic === true;
  const hasSchemaOps =
    !!(schemaPatch && typeof schemaPatch === 'object' && Array.isArray(schemaPatch.operations) && schemaPatch.operations.length);
  const hasSettings =
    !!(settingsPatch && typeof settingsPatch === 'object' && !Array.isArray(settingsPatch) && Object.keys(settingsPatch).length);
  const hasMeta =
    !!(templateMetadataPatch &&
      typeof templateMetadataPatch === 'object' &&
      !Array.isArray(templateMetadataPatch) &&
      Object.keys(templateMetadataPatch).length);
  const hasTitle = typeof templateTitlePatch === 'string' && String(templateTitlePatch).trim().length > 0;
  const hasLogic = includeLogic && Array.isArray(logicSuggestions) && logicSuggestions.length > 0;
  return hasSchemaOps || hasSettings || hasMeta || hasTitle || hasLogic;
}

/**
 * @param {string} s
 * @returns {boolean}
 */
function replyLooksLikeGenericConsulting(s) {
  const t = normText(s);
  if (!t) return false;
  return (
    /(proximos passos|pr[óo]ximos passos|melhorias uteis|tr[eê]s passos|adicionar campos faltantes|organizar em secoes|implementar logica condicional|testar o formulario)/.test(
      t
    ) ||
    /(criar secoes|section_break|adicionar campos|configurar regras)/.test(t)
  );
}

/**
 * @returns {string}
 */
function buildMustApplyPatchRepairUserMessage() {
  return (
    '## CORRECAO AUTOMATICA - resposta consultiva sem patch REJEITADA\n\n' +
    'Ha material importado no contexto. Nao devolva so orientacoes gerais.\n' +
    'Entregue alteracoes aplicaveis no canvas agora.\n\n' +
    'Regras obrigatorias:\n' +
    '1) Gerar `schemaPatch` substancial (add/update/remove) e, quando aplicavel, `logicSuggestions`.\n' +
    '2) Inferir tipos automaticamente.\n' +
    '3) Nao responder apenas com “proximos passos”.\n' +
    '4) So usar `clarifyOptions` se houver ambiguidade realmente bloqueante.\n\n' +
    'Devolva JSON aplicavel.'
  );
}

/** @param {unknown} label */
function isEtapa1Label(label) {
  const s = normText(label);
  return s === 'etapa 1' || s === 'etapa1';
}

/**
 * Reaproveita a primeira "Etapa 1" vazia (placeholder) quando o Composer cria
 * uma segunda section_break logo abaixo, evitando duplicação visual no canvas.
 * Mantém o id da primeira etapa para preservar a UX do admin no editor.
 * @param {object[]} schemaData
 * @returns {object[]}
 */
function collapseLeadingEmptyEtapaPlaceholder(schemaData) {
  const schema = Array.isArray(schemaData) ? [...schemaData] : [];
  if (schema.length < 2) return schema;
  const first = schema[0];
  const second = schema[1];
  if (!first || !second) return schema;
  if (String(first.type || '') !== 'section_break') return schema;
  if (String(second.type || '') !== 'section_break') return schema;
  if (!isEtapa1Label(first.label)) return schema;

  // "Vazia" = primeiro bloco não tem perguntas entre a seção 1 e a seção 2.
  // Como second está logo após first, isso é verdadeiro.
  const secondLabel = String(second.label || '').trim();
  if (!secondLabel) return schema;
  if (isEtapa1Label(secondLabel)) return schema;

  // Reaproveita a etapa placeholder com o tema da seção seguinte.
  first.label = second.label;
  if (second.icon) first.icon = second.icon;
  if (second.iconLibrary) first.iconLibrary = second.iconLibrary;
  if (second.iconColor) first.iconColor = second.iconColor;
  if (second.sectionFillMode != null) first.sectionFillMode = second.sectionFillMode;
  if (second.multiple === true) first.multiple = true;

  // Remove a seção duplicada logo abaixo.
  schema.splice(1, 1);
  return schema;
}

/**
 * Uma rodada completa do Copilot Next (LLM + aplicação de patches).
 * @param {{
 *   messages: { role: string, content: string }[],
 *   schemaData?: object[],
 *   formContext?: Record<string, unknown>,
 *   spreadsheetSummary?: string,
 *   ragFilledFormsSummary?: string,
 *   ragSimilarTemplatesSummary?: string,
 *   templateSettings?: Record<string, unknown>,
 *   templateMetadata?: Record<string, unknown>,
 *   templateDraftTitle?: string,
 *   templateFolderId?: string | null,
 *   templateId?: string | null,
 *   templateSiblingTitles?: string[],
 *   documentationFetchedText?: string,
 *   documentationFetchWarning?: string,
 *   preferredMode?: string,
 * }} input
 */
async function runCopilotBrainTurn(input) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const schemaData = Array.isArray(input.schemaData) ? input.schemaData : [];
  const formContext = input.formContext && typeof input.formContext === 'object' ? input.formContext : {};
  const templateSettingsIn =
    input.templateSettings && typeof input.templateSettings === 'object' && !Array.isArray(input.templateSettings)
      ? /** @type {Record<string, unknown>} */ ({ ...input.templateSettings })
      : {};
  const templateMetadataIn =
    input.templateMetadata && typeof input.templateMetadata === 'object' && !Array.isArray(input.templateMetadata)
      ? /** @type {Record<string, unknown>} */ ({ ...input.templateMetadata })
      : {};

  const mergedFormContext = mergeFormContextWithSchemaInference(formContext, schemaData);
  const ctxBlock = buildFormContextBlock(mergedFormContext);
  const summary =
    input.spreadsheetSummary && String(input.spreadsheetSummary).trim()
      ? String(input.spreadsheetSummary).trim().slice(0, 12_000)
      : '';
  const rag =
    input.ragFilledFormsSummary && String(input.ragFilledFormsSummary).trim()
      ? '\n\n### Preenchimentos anteriores deste modelo (RAG)\n' +
        String(input.ragFilledFormsSummary).trim().slice(0, 14_000)
      : '';
  const ragLib =
    input.ragSimilarTemplatesSummary && String(input.ragSimilarTemplatesSummary).trim()
      ? '\n\n### Modelos semelhantes na biblioteca (RAG — referência)\n' +
        String(input.ragSimilarTemplatesSummary).trim().slice(0, 14_000)
      : '';
  const settingsBlock =
    '\n\n### Definições globais atuais (templateSettings)\n' + compactTemplateSettingsForPrompt(templateSettingsIn);
  const metadataBlock =
    '\n\n### Ícone da tarefa (templateMetadata)\n' + compactTemplateMetadataForPrompt(templateMetadataIn);

  const docFetchWarning =
    typeof input.documentationFetchWarning === 'string' && input.documentationFetchWarning.trim()
      ? input.documentationFetchWarning.trim()
      : '';
  const docText =
    input.documentationFetchedText && String(input.documentationFetchedText).trim()
      ? String(input.documentationFetchedText).trim().slice(0, 42_000)
      : '';
  /** Lista numerada de temas extraída no servidor (markdown ou texto plano/PDF) — o modelo tende a ignorar só instruções genéricas. */
  const serverExtractedOutline = docText ? buildMandatoryOutlinePromptBlock(docText) : '';
  const docBlock = docText
    ? '\n\n### Conteúdo web lido pelo servidor (referência do administrador)\n' +
      'As secções «Fonte web» abaixo foram **descarregadas pelo painel** (HTTPS público). Podem ser **HTML**, **PDF** (texto extraído) ou **documentos oficiais** (contratos, RIA, licitações, termos). Trate-as como **fonte primária** para estruturar o formulário e as regras de negócio.\n' +
      '- **Análise:** extraia requisitos, etapas, listas de verificação, condições e riscos descritos no texto; converta em **section_break**, campos e **logicSuggestions** quando couber.\n' +
      '- **Conhecimento geral:** pode complementar com práticas habituais do domínio (NR, saúde, qualidade, etc.), mas **não invente** requisitos contraditórios ao texto carregado. **Não** existe pesquisa web em tempo real além deste texto — não afirme que «pesquisou na web».\n' +
      '- **Integrações API:** se o link for documentação de API e o utilizador quiser preenchimento automático, proponha **API_FETCH** (HTTPS; regras como já definido no motor).\n\n' +
      '#### Decomposição obrigatória de artigos / guias / checklists / modelos oficiais (crítico)\n' +
      'Texto abaixo costuma ter **títulos** (##/### em HTML), **ANEXO/APÊNDICE**, **itens numerados**, **cláusulas**, **subtítulos** e **listas com marcadores** — isso é o **esqueleto** do formulário. Em **PDF de modelo RIA / contrato / licitação**, cada bloco numerado ou coluna de critérios deve tender a **campos próprios** ou **repeatable_matrix**, não um único `text` «preencher conforme modelo». **Proibido** condensar vários capítulos do texto num **único** campo genérico (ex.: um `checkbox` ou `multiselect` «Itens de segurança» com três ou quatro palavras **quando o artigo descreve capítulos distintos**: alarme/detecção, rotas de fuga, equipamentos, iluminação, produtos perigosos, etc.). Isso produz resultado **inferior** ao link — trate como **falha** de espelhamento.\n' +
      '- **Por capítulo do texto** (cada tema principal: p.ex. detecção e alarme; saídas e rotas; extinção e hidrantes; iluminação e energia de reserva; materiais perigosos): pelo menos um **`section_break`** com rótulo fiel ao tema, seguido de campos que **desdobrem** o que o parágrafo ou a lista pedem.\n' +
      '- **Listas de verificação** sob um subtítulo (vários itens com «verificar», «teste», «inspeção»): **um critério verificável por linha** — `yes_no` + evidência, `repeatable_matrix`, ou `multiple_choice` por sub-item; **não** agrupe cinco verificações distintas numa única pergunta sim/não.\n' +
      '- **Tipos de campo:** inferir automaticamente o tipo ideal por requisito; não abrir entrevista de tipo de campo salvo ambiguidade técnica bloqueante.\n' +
      '- **Evidências:** para constatações de vistoria, pareie **photo** / **file_upload** / **image_annotation** (e **REQUIRE** condicional nos **logicSuggestions** quando «não conforme» ou falha de teste).\n' +
      '- **Regra default de criticidade:** para cada novo `yes_no`, `dropdown` de conformidade, `rating` e `number` crítico, colocar **na sequência imediata** um campo de evidência (preferir `photo`) com `required: true`.\n' +
      '- No **replyText**, **declare** quantos temas principais o miolo do artigo cobre **face** ao número de **section_break** operacionais na proposta (para além de identificação/cadastro); se faltar cobertura, admita **insuficiência** e **expanda** o **schemaPatch** na mesma rodada.\n' +
      '- Ignore **lixo de navegação** no HTML (menus, «últimas postagens», milhares de links de rodapé); foque no **miolo** do artigo (parágrafos e listas após o título principal).\n\n' +
      '#### Piso mínimo e anti-degeneração (obrigatório com texto web acima)\n' +
      'O resultado **não pode** degradar-se a: um único `multiselect`/`checkbox` com frases genéricas («extintores», «alarme», …) **+** uma `photo` única **+** `signature` **+** observações — isso foi considerado **inaceitável** para checklist AVCB/PCI baseado em artigo.\n' +
      '- Com artigo de **vários capítulos** (como guia de itens para AVCB): produza **pelo menos 5 `section_break`** com **rótulos temáticos** (nomes do miolo: ex.: detecção/alarme; rotas de fuga; equipamentos de combate; iluminação/autonomia; produtos perigosos) e **pelo menos 15 campos operacionais** que não sejam só `section_break`, **salvo** o utilizador pedir explicitamente «formulário mínimo» ou «só 5 perguntas».\n' +
      '- **Ordem do fluxo:** campos de **abertura** (identificação, obra, data) → **miolo** por tema → **observações** → **`signature`** / responsável **no fim**. **Proibido** colocar `signature` como **primeiro** campo operacional após uma etapa vazia.\n' +
      '- **Proibido** manter etapa com rótulo genérico «Etapa 1» sem significado — renomeie para o primeiro tema ou «Identificação».\n' +
      '- **Fotos:** uma única foto «Evidências» genérica **não** substitui várias zonas do artigo — use **várias** `photo` ou `photo_stamped` por tema/subitem crítico, ou `repeatable_matrix` com coluna de observação + foto por linha quando o motor permitir.\n' +
      '- Se o canvas actual estiver **vazio ou quase vazio** e o artigo for longo, o **schemaPatch** deve ser **grande** (vários `add_field` em cadeia) — **não** poupar operações ao ponto de entregar formulário inútil.\n' +
      '- **Proibido** o padrão de formulário só com `text` «Descrição dos itens», «Lista de documentos», «Descrição dos procedimentos», «Informações adicionais» — isso **não** espelha o documento; use os temas listados abaixo (quando existirem).\n\n' +
      (serverExtractedOutline || '') +
      '\n\n#### Texto integral da fonte (referência; o esboço acima tem prioridade de estrutura)\n' +
      docText
    : '';

  const preferredMode =
    typeof input.preferredMode === 'string' && input.preferredMode.trim() ? input.preferredMode.trim() : 'auto';

  const systemBase = buildNextSystemPrompt({
    schemaData,
    preferredMode,
    templateDraftTitle:
      input.templateDraftTitle != null && String(input.templateDraftTitle).trim()
        ? String(input.templateDraftTitle).trim()
        : '',
    templateSiblingTitles: Array.isArray(input.templateSiblingTitles) ? input.templateSiblingTitles : [],
  });

  const systemPrompt =
    systemBase +
    (ctxBlock ? '\n\n' + ctxBlock : '') +
    (summary ? `\n\n### Resumo de anexos / importação\n${summary}` : '') +
    rag +
    ragLib +
    settingsBlock +
    metadataBlock +
    docBlock +
    (docFetchWarning ? `\n\n(Aviso documentação: ${docFetchWarning})\n` : '') +
    '\n\n### Formulário atual (JSON compacto)\n' +
    compactSchemaForPrompt(schemaData);

  const bounded = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .slice(-18)
    .map((m) => ({
      role: m.role,
      content: String(m.content || '').slice(0, 14_000),
    }));

  let parsed = await openAiCopilotJson(systemPrompt, bounded, docText ? 0.22 : 0.35, {
    maxTokens: docText ? 16384 : 8192,
  });

  let out = await applyCopilotParsedPayload(parsed, {
    schemaData,
    templateSettingsIn,
    templateMetadataIn,
    templateDraftTitle: input.templateDraftTitle,
    templateFolderId: input.templateFolderId,
    templateId: input.templateId,
    templateSiblingTitles: input.templateSiblingTitles,
    documentationFetchWarning: docFetchWarning || undefined,
  });

  const outlineForRepair = docText ? extractDocumentOutlineForCopilot(docText) : [];
  const needsMirrorRepair =
    docText &&
    outlineForRepair.length >= 5 &&
    (!out.clarifyOptions || out.clarifyOptions.length === 0) &&
    isDocMirrorTooThin(out.schemaData, outlineForRepair);

  if (needsMirrorRepair) {
    try {
      const repairUser = buildDocMirrorRepairUserMessage(out.schemaData, outlineForRepair);
      const asst = String(out.replyText || '').trim();
      const repairMessages = bounded.concat([
        { role: 'assistant', content: asst ? asst.slice(0, 14_000) : '(sem texto na primeira passagem.)' },
        { role: 'user', content: repairUser.slice(0, 14_000) },
      ]);
      parsed = await openAiCopilotJson(systemPrompt, repairMessages, 0.12, { maxTokens: 16384 });
      const outRepair = await applyCopilotParsedPayload(parsed, {
        schemaData: out.schemaData,
        templateSettingsIn: out.templateSettings,
        templateMetadataIn: out.templateMetadata,
        templateDraftTitle: input.templateDraftTitle,
        templateFolderId: input.templateFolderId,
        templateId: input.templateId,
        templateSiblingTitles: input.templateSiblingTitles,
        documentationFetchWarning: docFetchWarning || undefined,
      });
      const w1 = Array.isArray(out.warnings) ? out.warnings : [];
      const w2 = Array.isArray(outRepair.warnings) ? outRepair.warnings : [];
      out = {
        ...outRepair,
        replyText:
          out.replyText +
          '\n\n---\n**Correção automática (validador Aria — espelhamento do documento):**\n\n' +
          outRepair.replyText,
        warnings: w1.concat(
          'Validador: a 1.ª proposta não cobria os títulos do artigo na referência web; foi aplicada uma **2.ª passagem** automática.',
          w2
        ),
      };
    } catch (eRep) {
      const msg = eRep && eRep.message ? String(eRep.message) : 'erro desconhecido';
      const w = Array.isArray(out.warnings) ? out.warnings : [];
      out = {
        ...out,
        warnings: w.concat('Validador: 2.ª passagem automática falhou — ' + msg.slice(0, 240)),
      };
    }
  }

  const touchedDecisionIds = collectTouchedDecisionFieldIds(schemaData, out.schemaData);
  const missingSequentialEvidence = findMissingSequentialEvidence(out.schemaData, touchedDecisionIds);
  const needsEvidenceRepair =
    missingSequentialEvidence.length > 0 && (!out.clarifyOptions || out.clarifyOptions.length === 0);

  if (needsEvidenceRepair) {
    try {
      const repairUser = buildSequentialEvidenceRepairUserMessage(missingSequentialEvidence);
      const asst = String(out.replyText || '').trim();
      const repairMessages = bounded.concat([
        { role: 'assistant', content: asst ? asst.slice(0, 14_000) : '(sem texto na primeira passagem.)' },
        { role: 'user', content: repairUser.slice(0, 14_000) },
      ]);
      parsed = await openAiCopilotJson(systemPrompt, repairMessages, 0.08, { maxTokens: 16384 });
      const outRepair = await applyCopilotParsedPayload(parsed, {
        schemaData: out.schemaData,
        templateSettingsIn: out.templateSettings,
        templateMetadataIn: out.templateMetadata,
        templateDraftTitle: input.templateDraftTitle,
        templateFolderId: input.templateFolderId,
        templateId: input.templateId,
        templateSiblingTitles: input.templateSiblingTitles,
        documentationFetchWarning: docFetchWarning || undefined,
      });
      const w1 = Array.isArray(out.warnings) ? out.warnings : [];
      const w2 = Array.isArray(outRepair.warnings) ? outRepair.warnings : [];
      out = {
        ...outRepair,
        replyText:
          out.replyText +
          '\n\n---\n**Correcao automatica (validador Aria - evidencia sequencial):**\n\n' +
          outRepair.replyText,
        warnings: w1.concat(
          'Validador: a proposta nao cumpria a regra de evidencia sequencial; foi aplicada uma 2a passagem automatica.',
          w2
        ),
      };
    } catch (eRep) {
      const msg = eRep && eRep.message ? String(eRep.message) : 'erro desconhecido';
      const w = Array.isArray(out.warnings) ? out.warnings : [];
      out = {
        ...out,
        warnings: w.concat('Validador de evidencia sequencial: 2a passagem automatica falhou - ' + msg.slice(0, 240)),
      };
    }
  }

  const needsRegulatoryDepthRepair =
    isRegulatoryNormDocument(docText) &&
    isRegulatorySchemaTooGeneric(out.schemaData) &&
    (!out.clarifyOptions || out.clarifyOptions.length === 0);

  if (needsRegulatoryDepthRepair) {
    try {
      const repairUser = buildRegulatoryDepthRepairUserMessage();
      const asst = String(out.replyText || '').trim();
      const repairMessages = bounded.concat([
        { role: 'assistant', content: asst ? asst.slice(0, 14_000) : '(sem texto na primeira passagem.)' },
        { role: 'user', content: repairUser.slice(0, 14_000) },
      ]);
      parsed = await openAiCopilotJson(systemPrompt, repairMessages, 0.08, { maxTokens: 16384 });
      const outRepair = await applyCopilotParsedPayload(parsed, {
        schemaData: out.schemaData,
        templateSettingsIn: out.templateSettings,
        templateMetadataIn: out.templateMetadata,
        templateDraftTitle: input.templateDraftTitle,
        templateFolderId: input.templateFolderId,
        templateId: input.templateId,
        templateSiblingTitles: input.templateSiblingTitles,
        documentationFetchWarning: docFetchWarning || undefined,
      });
      const w1 = Array.isArray(out.warnings) ? out.warnings : [];
      const w2 = Array.isArray(outRepair.warnings) ? outRepair.warnings : [];
      out = {
        ...outRepair,
        replyText:
          out.replyText +
          '\n\n---\n**Correcao automatica (validador Aria - profundidade regulatoria):**\n\n' +
          outRepair.replyText,
        warnings: w1.concat(
          'Validador: a proposta estava generica para documento normativo (NR); foi aplicada uma 2a passagem automatica.',
          w2
        ),
      };
    } catch (eRep) {
      const msg = eRep && eRep.message ? String(eRep.message) : 'erro desconhecido';
      const w = Array.isArray(out.warnings) ? out.warnings : [];
      out = {
        ...out,
        warnings: w.concat('Validador de profundidade regulatoria: 2a passagem automatica falhou - ' + msg.slice(0, 240)),
      };
    }
  }

  const shouldForceNoTypeClarifyRepair =
    Array.isArray(out.clarifyOptions) &&
    out.clarifyOptions.length > 0 &&
    isFieldTypeClarification(out.clarifyOptions);

  if (shouldForceNoTypeClarifyRepair) {
    try {
      const repairUser = buildNoTypeClarifyRepairUserMessage();
      const asst = String(out.replyText || '').trim();
      const repairMessages = bounded.concat([
        { role: 'assistant', content: asst ? asst.slice(0, 14_000) : '(sem texto na primeira passagem.)' },
        { role: 'user', content: repairUser.slice(0, 14_000) },
      ]);
      parsed = await openAiCopilotJson(systemPrompt, repairMessages, 0.08, { maxTokens: 16384 });
      const outRepair = await applyCopilotParsedPayload(parsed, {
        schemaData: out.schemaData,
        templateSettingsIn: out.templateSettings,
        templateMetadataIn: out.templateMetadata,
        templateDraftTitle: input.templateDraftTitle,
        templateFolderId: input.templateFolderId,
        templateId: input.templateId,
        templateSiblingTitles: input.templateSiblingTitles,
        documentationFetchWarning: docFetchWarning || undefined,
      });
      const w1 = Array.isArray(out.warnings) ? out.warnings : [];
      const w2 = Array.isArray(outRepair.warnings) ? outRepair.warnings : [];
      out = {
        ...outRepair,
        replyText:
          out.replyText +
          '\n\n---\n**Correcao automatica (validador Aria - inferencia de tipo):**\n\n' +
          outRepair.replyText,
        warnings: w1.concat(
          'Validador: perguntas de tipo de campo foram suprimidas; aplicada 2a passagem com inferencia automatica.',
          w2
        ),
      };
    } catch (eRep) {
      const msg = eRep && eRep.message ? String(eRep.message) : 'erro desconhecido';
      const w = Array.isArray(out.warnings) ? out.warnings : [];
      out = {
        ...out,
        warnings: w.concat('Validador de inferencia de tipo: 2a passagem automatica falhou - ' + msg.slice(0, 240)),
      };
    }
  }

  const hasImportedContext = !!(summary || docText);
  const hasConcreteChange = hasAnyConcreteChange(
    out.schemaPatch,
    out.settingsPatch,
    out.templateMetadataPatch,
    out.templateTitlePatch,
    out.logicSuggestions,
    { includeLogic: false }
  );
  const shouldForceApplyPatchRepair =
    hasImportedContext &&
    !hasConcreteChange &&
    (!out.clarifyOptions || out.clarifyOptions.length === 0) &&
    String(out.copilotMode || 'auto') !== 'explain' &&
    replyLooksLikeGenericConsulting(out.replyText);

  if (shouldForceApplyPatchRepair) {
    try {
      const repairUser = buildMustApplyPatchRepairUserMessage();
      const asst = String(out.replyText || '').trim();
      const repairMessages = bounded.concat([
        { role: 'assistant', content: asst ? asst.slice(0, 14_000) : '(sem texto na primeira passagem.)' },
        { role: 'user', content: repairUser.slice(0, 14_000) },
      ]);
      parsed = await openAiCopilotJson(systemPrompt, repairMessages, 0.08, { maxTokens: 16384 });
      const outRepair = await applyCopilotParsedPayload(parsed, {
        schemaData: out.schemaData,
        templateSettingsIn: out.templateSettings,
        templateMetadataIn: out.templateMetadata,
        templateDraftTitle: input.templateDraftTitle,
        templateFolderId: input.templateFolderId,
        templateId: input.templateId,
        templateSiblingTitles: input.templateSiblingTitles,
        documentationFetchWarning: docFetchWarning || undefined,
      });
      const w1 = Array.isArray(out.warnings) ? out.warnings : [];
      const w2 = Array.isArray(outRepair.warnings) ? outRepair.warnings : [];
      out = {
        ...outRepair,
        replyText:
          out.replyText +
          '\n\n---\n**Correcao automatica (validador Aria - patch obrigatorio):**\n\n' +
          outRepair.replyText,
        warnings: w1.concat(
          'Validador: resposta consultiva sem patch foi rejeitada; aplicada 2a passagem com alteracoes aplicaveis.',
          w2
        ),
      };
    } catch (eRep) {
      const msg = eRep && eRep.message ? String(eRep.message) : 'erro desconhecido';
      const w = Array.isArray(out.warnings) ? out.warnings : [];
      out = {
        ...out,
        warnings: w.concat('Validador de patch obrigatorio: 2a passagem automatica falhou - ' + msg.slice(0, 240)),
      };
    }
  }

  // Higiene final de UX no canvas: evita "Etapa 1" vazia + seção temática duplicada logo abaixo.
  out = {
    ...out,
    schemaData: collapseLeadingEmptyEtapaPlaceholder(out.schemaData),
  };

  return out;
}

module.exports = {
  runCopilotBrainTurn,
};
