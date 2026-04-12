'use strict';

/**
 * Fonte única de verdade para tipos de campo do Form Builder / app móvel.
 * Prompts da IA são derivados disto para evitar drift com formAiNormalize.
 */

/** @typedef {{ type: string, tier: 'core'|'advanced', proposalsDefault: boolean, contextFlag?: string, descPt: string }} FieldSpec */

/** @type {FieldSpec[]} */
const FIELD_SPECS = [
  { type: 'section_break', tier: 'core', proposalsDefault: false, descPt: 'Separador de etapa/página no app.' },
  { type: 'text', tier: 'core', proposalsDefault: true, descPt: 'Texto livre.' },
  { type: 'number', tier: 'core', proposalsDefault: true, descPt: 'Valor numérico.' },
  { type: 'phone', tier: 'core', proposalsDefault: true, descPt: 'Telefone.' },
  { type: 'email', tier: 'core', proposalsDefault: true, descPt: 'E-mail.' },
  { type: 'date', tier: 'core', proposalsDefault: true, descPt: 'Data/hora.' },
  { type: 'checkbox', tier: 'core', proposalsDefault: true, descPt: 'Caixa de confirmação.' },
  { type: 'yes_no', tier: 'core', proposalsDefault: true, descPt: 'Sim/Não.' },
  { type: 'dropdown', tier: 'core', proposalsDefault: true, descPt: 'Lista fechada (uma opção).' },
  { type: 'multiselect', tier: 'core', proposalsDefault: true, descPt: 'Várias opções.' },
  { type: 'rating', tier: 'core', proposalsDefault: true, descPt: 'Classificação por estrelas.' },
  { type: 'file_upload', tier: 'core', proposalsDefault: true, descPt: 'Anexo de arquivo.' },
  { type: 'photo', tier: 'core', proposalsDefault: true, descPt: 'Fotografia (galeria ou câmera).' },
  { type: 'signature', tier: 'core', proposalsDefault: true, descPt: 'Assinatura na tela.' },
  {
    type: 'signature_summary',
    tier: 'advanced',
    proposalsDefault: false,
    descPt: 'Resumo só leitura dos campos escolhidos + assinatura no fim (cliente).',
  },
  {
    type: 'materials_consumption',
    tier: 'advanced',
    proposalsDefault: true,
    descPt: 'Consumo do estoque técnico (separado de bens); baixa ao submeter.',
  },
  {
    type: 'materials_receipt',
    tier: 'advanced',
    proposalsDefault: true,
    descPt: 'Entrada no estoque técnico (separado de bens); aumenta saldo ao submeter.',
  },
  {
    type: 'technician_finance',
    tier: 'advanced',
    proposalsDefault: true,
    descPt: 'Despesas/receitas do técnico por atendimento; módulo financeiro técnico (sem bens).',
  },
  { type: 'location_pick', tier: 'core', proposalsDefault: true, descPt: 'GPS + mapa (alfinete).' },
  { type: 'hidden', tier: 'advanced', proposalsDefault: true, descPt: 'Campo oculto no celular.' },
  {
    type: 'photo_stamped',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'requireStampedPhotos',
    descPt: 'Foto só com câmera ao vivo; carimbo GPS/data (anti-fraude).',
  },
  {
    type: 'barcode_scan',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowBarcode',
    descPt: 'Leitura de código de barras/QR no dispositivo.',
  },
  {
    type: 'facial_recognition',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowFacial',
    descPt: 'Biometria facial (CompreFace: self_verify ou identify no builder).',
  },
  {
    type: 'transit_start',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowTransit',
    descPt:
      'Início de deslocamento (registro operacional). Sempre em par com transit_end; no BrSpark ficam sempre no início do formulário (primeiro bloco operacional), nunca no meio nem no fim.',
  },
  {
    type: 'transit_end',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowTransit',
    descPt:
      'Fim de deslocamento. Obrigatório se existir transit_start; nunca antes do início; no BrSpark ficam sempre no início do formulário (logo após transit_start), nunca no meio nem no fim.',
  },
  {
    type: 'geofence_check',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowGeofence',
    descPt: 'Validação de proximidade ao ponto da OS (metros).',
  },
  {
    type: 'calculated',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowCalculated',
    descPt: 'Valor calculado por fórmula (configurar no builder).',
  },
];

const ALLOWED_FIELD_TYPES = new Set(FIELD_SPECS.map((s) => s.type));

/**
 * @param {Record<string, unknown>} [formContext]
 * @returns {string[]}
 */
function buildAnalyzeFieldTypesList(formContext = {}) {
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
  const out = [];
  for (const s of FIELD_SPECS) {
    if (s.type === 'section_break') continue;
    if (s.proposalsDefault) {
      out.push(s.type);
      continue;
    }
    if (s.contextFlag && ctx[s.contextFlag] === true) out.push(s.type);
  }
  return [...new Set(out)];
}

/**
 * Lista para o system prompt da fase "analisar" (opções por campo).
 * @param {Record<string, unknown>} [formContext]
 */
function formatAnalyzeFieldTypesForPrompt(formContext) {
  const list = buildAnalyzeFieldTypesList(formContext);
  return list.join(', ');
}

/**
 * Bloco de documentação para geração directa de schema (schemaData).
 */
function formatSchemaTypeDocBlock() {
  return FIELD_SPECS.filter((s) => s.type !== 'section_break')
    .map((s) => `- ${s.type}: ${s.descPt}`)
    .join('\n');
}

/**
 * Regras BrSpark para deslocamento — incluir nos system prompts (Copiloto, análise de planilha, geração de schema).
 * @returns {string}
 */
function formatTransitDisplacementRulesForPrompt() {
  return `### Deslocamento (transit_start / transit_end)
- **Regra fixa BrSpark:** com deslocamento ativo, **início** (\`transit_start\`) e **fim** (\`transit_end\`) ficam **sempre no início do formulário** para o técnico — o **primeiro bloco operacional** do preenchimento: (a) logo **após** o \`section_break\` que abre a **primeira etapa**, **antes** de fotos, assinaturas e restantes perguntas; ou (b), se existir zona «antes da primeira seção», ainda assim como **primeiros campos** dessa zona. **Nunca** os coloque no meio nem no rodapé do checklist.
- **Par obrigatório**: se houver \`transit_start\`, **tem de existir** \`transit_end\` no mesmo formulário. Não sugira nem crie só um dos dois.
- **Ordem no array:** primeiro \`transit_start\`, depois \`transit_end\`; \`transit_end\` **nunca** antes do primeiro \`transit_start\`.
- Em \`schemaPatch\` (ex.: \`add_field\` com \`afterId\`) ou \`schemaData\`, **garanta** essa posição no topo; não «empurre» o par para o fim com \`afterId\` em últimos campos.`;
}

/** Ícones Ionicons por tipo quando o modelo não enviou icon (fallback no servidor). */
const DEFAULT_BRSPARK_TYPE_ICONS = {
  section_break: { icon: 'albums-outline', iconColor: '#7c3aed' },
  text: { icon: 'text-outline', iconColor: '#475569' },
  number: { icon: 'keypad-outline', iconColor: '#0369a1' },
  phone: { icon: 'call-outline', iconColor: '#0d9488' },
  email: { icon: 'mail-outline', iconColor: '#7c3aed' },
  date: { icon: 'calendar-outline', iconColor: '#b45309' },
  checkbox: { icon: 'checkbox-outline', iconColor: '#4f46e5' },
  yes_no: { icon: 'toggle-outline', iconColor: '#4338ca' },
  dropdown: { icon: 'list-outline', iconColor: '#6366f1' },
  multiselect: { icon: 'list-circle-outline', iconColor: '#6366f1' },
  rating: { icon: 'star-outline', iconColor: '#ca8a04' },
  file_upload: { icon: 'cloud-upload-outline', iconColor: '#2563eb' },
  photo: { icon: 'camera-outline', iconColor: '#db2777' },
  photo_stamped: { icon: 'camera-outline', iconColor: '#be185d' },
  signature: { icon: 'pencil-outline', iconColor: '#0f766e' },
  signature_summary: { icon: 'reader-outline', iconColor: '#0e7490' },
  materials_consumption: { icon: 'cube-outline', iconColor: '#ea580c' },
  materials_receipt: { icon: 'archive-outline', iconColor: '#16a34a' },
  technician_finance: { icon: 'cash-outline', iconColor: '#15803d' },
  location_pick: { icon: 'location-outline', iconColor: '#0ea5e9' },
  hidden: { icon: 'eye-off-outline', iconColor: '#94a3b8' },
  barcode_scan: { icon: 'barcode-outline', iconColor: '#475569' },
  facial_recognition: { icon: 'scan-outline', iconColor: '#7e22ce' },
  transit_start: { icon: 'rocket-outline', iconColor: '#2563eb' },
  transit_end: { icon: 'flag-outline', iconColor: '#dc2626' },
  geofence_check: { icon: 'navigate-circle-outline', iconColor: '#ea580c' },
  calculated: { icon: 'calculator-outline', iconColor: '#8b5cf6' },
};

const SECTION_ICON_COLORS = ['#6366f1', '#0ea5e9', '#16a34a', '#ca8a04', '#ea580c', '#db2777', '#7c3aed'];

/**
 * Preenche icon / iconLibrary / iconColor em itens do schema quando vêm vazios (pós-normalização).
 * @param {object[]} schemaData
 */
function applyDefaultTypeIconsToSchemaItems(schemaData) {
  if (!Array.isArray(schemaData)) return;
  let secIdx = 0;
  for (const item of schemaData) {
    if (!item || typeof item !== 'object') continue;
    if (item.icon != null && String(item.icon).trim()) continue;
    const def = DEFAULT_BRSPARK_TYPE_ICONS[item.type];
    if (!def) continue;
    item.icon = def.icon;
    item.iconLibrary = 'Ionicons';
    if (item.type === 'section_break') {
      item.iconColor = SECTION_ICON_COLORS[secIdx % SECTION_ICON_COLORS.length];
      secIdx += 1;
    } else {
      item.iconColor = def.iconColor || '#475569';
    }
  }
}

/**
 * Regras de ícones para prompts (Copiloto, geração canónica de schema, etc.).
 * @returns {string}
 */
function formatAutomaticIconRulesForPrompt() {
  return `### Ícones automáticos (obrigatório)
- Para **cada** campo e **cada** etapa (\`section_break\`) no schema: defina **sempre** \`icon\` (Ionicons em kebab-case, preferir sufixo \`-outline\` quando existir), \`iconLibrary\`: \`Ionicons\` e \`iconColor\` (hex legível, ex.: #6366f1, #0f766e, #c2410c). Escolha pelo **tipo** e **rótulo** (ex.: foto → camera-outline; assinatura → pencil-outline; lista → list-outline).
- **Varie** \`iconColor\` entre etapas para distinguir secções no app; mantenha coerência dentro da mesma etapa.
- Em **schemaPatch**: em **todo** \`add_field.field\` novo inclua os três campos; em \`update_field.patch\` preencha ícones em falta quando alterar rótulo/tipo ou quando o utilizador pedir melhoria visual.
- **Ícone da tarefa / formulário** (lista de modelos no painel): alinhado ao título ou sector (ex.: vistoria → clipboard-outline; visita → business-outline). No **Copiloto** use **templateMetadataPatch** \`{ "icon": "<nome Ionicons>" }\` (ou omita para não alterar). Na **geração directa** de formulário (JSON raiz com title/schemaData), inclua no mesmo objecto raiz \`metadata\`: \`{ "icon": "<nome Ionicons>" }\`.`;
}

/**
 * @param {Record<string, unknown>} [ctx]
 * @returns {string}
 */
function buildFormContextBlock(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const lines = [];
  if (ctx.objective) lines.push(`Objetivo: ${String(ctx.objective).trim().slice(0, 800)}`);
  if (ctx.sector) lines.push(`Sector / área: ${String(ctx.sector).trim().slice(0, 200)}`);
  if (ctx.formKind) lines.push(`Tipo de formulário: ${String(ctx.formKind).trim().slice(0, 80)}`);
  const flags = [];
  if (ctx.requireStampedPhotos) flags.push('fotos com carimbo obrigatório');
  if (ctx.allowBarcode) flags.push('código de barras');
  if (ctx.requireGps) flags.push('localização GPS');
  if (ctx.allowGeofence) flags.push('cerca geográfica');
  if (ctx.allowTransit) flags.push('deslocamento início/fim');
  if (ctx.allowFacial) flags.push('biometria facial');
  if (ctx.allowSignature) flags.push('assinatura');
  if (ctx.allowCalculated) flags.push('campos calculados');
  if (flags.length) lines.push(`Requisitos indicados: ${flags.join(', ')}.`);
  const fc = ctx.focusedCanvasField;
  if (fc && typeof fc === 'object' && !Array.isArray(fc)) {
    const id = fc.id != null ? String(fc.id).trim().slice(0, 96) : '';
    const lab = fc.label != null ? String(fc.label).trim().slice(0, 240) : '';
    const typ = fc.type != null ? String(fc.type).trim().slice(0, 72) : '';
    if (id || lab) {
      const ic = fc.icon != null ? String(fc.icon).trim().slice(0, 120) : '';
      const ilib = fc.iconLibrary != null ? String(fc.iconLibrary).trim().slice(0, 40) : '';
      const iconBit = ic ? ` · ícone atual=${ic}${ilib ? ` (${ilib})` : ''}` : '';
      lines.push(
        `Campo em foco no builder (o utilizador indicou que a conversa é principalmente sobre este bloco): «${lab || '—'}» · tipo=${typ || '?'} · id=${id || '—'}${iconBit}. Priorize patches e explicações que afetem este campo quando o pedido for ambíguo; use o id nas operações schemaPatch quando precisar de update_field ou remove_field.`,
      );
    }
  }
  if (lines.length === 0) return '';
  return '### Contexto do formulário (definido pelo administrador)\n' + lines.join('\n') + '\n';
}

/** Rótulos curtos para botões no assistente "analisar planilha". */
const ANALYZE_OPTION_SHORT_PT = {
  text: 'Texto livre',
  number: 'Número',
  phone: 'Telefone',
  email: 'E-mail',
  date: 'Data / hora',
  checkbox: 'Checkbox',
  yes_no: 'Sim / Não',
  dropdown: 'Lista (dropdown)',
  multiselect: 'Múltipla escolha',
  rating: 'Estrelas',
  file_upload: 'Anexo (arquivo)',
  photo: 'Fotografia',
  signature: 'Assinatura',
  signature_summary: 'Resumo para assinatura',
  location_pick: 'GPS / mapa',
  hidden: 'Oculto',
  photo_stamped: 'Foto carimbada',
  barcode_scan: 'Código barras',
  facial_recognition: 'Biometria facial',
  transit_start: 'Início deslocamento',
  transit_end: 'Fim deslocamento',
  geofence_check: 'Cerca (geofence)',
  calculated: 'Calculado',
  materials_consumption: 'Materiais / consumo',
  materials_receipt: 'Materiais / entrada',
  technician_finance: 'Custos do técnico',
};

/**
 * Opções-padrão por tipo (uma por tipo permitido na fase analisar), para o usuário nunca ficar só com 2 botões.
 * @param {Record<string, unknown>} [formContext]
 * @returns {{ type: string, shortLabel: string, hint: string }[]}
 */
function buildDefaultAnalyzeProposalOptions(formContext = {}) {
  const types = buildAnalyzeFieldTypesList(formContext);
  return types.map((type) => ({
    type,
    shortLabel: ANALYZE_OPTION_SHORT_PT[type] || type,
    hint: '',
  }));
}

module.exports = {
  FIELD_SPECS,
  ALLOWED_FIELD_TYPES,
  buildAnalyzeFieldTypesList,
  buildDefaultAnalyzeProposalOptions,
  formatAnalyzeFieldTypesForPrompt,
  formatSchemaTypeDocBlock,
  formatTransitDisplacementRulesForPrompt,
  formatAutomaticIconRulesForPrompt,
  applyDefaultTypeIconsToSchemaItems,
  buildFormContextBlock,
};
