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
  { type: 'file_upload', tier: 'core', proposalsDefault: true, descPt: 'Anexo de ficheiro.' },
  { type: 'photo', tier: 'core', proposalsDefault: true, descPt: 'Fotografia (galeria ou câmara).' },
  { type: 'signature', tier: 'core', proposalsDefault: true, descPt: 'Assinatura no ecrã.' },
  { type: 'location_pick', tier: 'core', proposalsDefault: true, descPt: 'GPS + mapa (alfinete).' },
  { type: 'hidden', tier: 'advanced', proposalsDefault: true, descPt: 'Campo oculto no telemóvel.' },
  {
    type: 'photo_stamped',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'requireStampedPhotos',
    descPt: 'Foto só com câmara ao vivo; carimbo GPS/data (anti-fraude).',
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
    descPt: 'Biometria facial (compara com perfil do técnico).',
  },
  {
    type: 'transit_start',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowTransit',
    descPt: 'Início de deslocamento (registo operacional).',
  },
  {
    type: 'transit_end',
    tier: 'advanced',
    proposalsDefault: false,
    contextFlag: 'allowTransit',
    descPt: 'Fim de deslocamento.',
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
 * Lista para o system prompt da fase «analisar» (opções por campo).
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
 * @param {Record<string, unknown>} [ctx]
 * @returns {string}
 */
function buildFormContextBlock(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const lines = [];
  if (ctx.objective) lines.push(`Objectivo: ${String(ctx.objective).trim().slice(0, 800)}`);
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
  if (lines.length === 0) return '';
  return '### Contexto do formulário (definido pelo administrador)\n' + lines.join('\n') + '\n';
}

module.exports = {
  FIELD_SPECS,
  ALLOWED_FIELD_TYPES,
  buildAnalyzeFieldTypesList,
  formatAnalyzeFieldTypesForPrompt,
  formatSchemaTypeDocBlock,
  buildFormContextBlock,
};
