'use strict';

const { ALLOWED_FIELD_TYPES } = require('./formAiFieldCatalog');

function randomFieldId(usedIds) {
  let id;
  do {
    id = 'field_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6);
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function defaultFieldShell(type, label) {
  const t = type || 'text';
  return {
    id: '',
    type: t,
    label: String(label || 'Campo').trim() || 'Campo',
    required: false,
    multiple: false,
    minItems: '',
    maxItems: '',
    requireOnlineValidation: false,
    dependsOnId: '',
    dependsOnOperator: '==',
    dependsOnValue: '',
    geofenceRadius: t === 'geofence_check' ? '150' : null,
    options: t === 'dropdown' || t === 'multiselect' ? 'Opção 1, Opção 2' : null,
    calcFormula: t === 'calculated' ? '' : null,
    textMask: t === 'text' || t === 'number' || t === 'phone' ? '' : null,
    description: '',
    helpHtml: '',
    showFieldInstructions: false,
    defaultValue: '',
    icon: '',
    allowTechnicianComment: false,
    allowMediaDescription: false,
    ...(t === 'section_break' ? { sectionFillMode: 'list' } : {}),
  };
}

/**
 * Normaliza um item vindo do LLM para o formato esperado pelo checklists-builder.
 */
function normalizeSchemaItem(raw, usedIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let type = String(raw.type || 'text')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!ALLOWED_FIELD_TYPES.has(type)) type = 'text';
  const label = raw.label != null ? String(raw.label) : 'Campo';
  const base = defaultFieldShell(type, label);
  const id =
    typeof raw.id === 'string' && raw.id.trim() && !usedIds.has(raw.id.trim())
      ? (usedIds.add(raw.id.trim()), raw.id.trim())
      : randomFieldId(usedIds);
  base.id = id;
  if (raw.required === true || raw.required === 'true') base.required = true;
  if (type === 'section_break' && (raw.multiple === true || raw.multiple === 'true')) {
    base.multiple = true;
  }
  if (raw.description != null && String(raw.description).trim()) {
    base.description = String(raw.description).trim();
  }
  if (Array.isArray(raw.options) && raw.options.length > 0) {
    base.options = raw.options.map((o) => String(o).trim()).filter(Boolean).join(', ');
  } else if (typeof raw.options === 'string' && raw.options.trim()) {
    base.options = raw.options.trim();
  }
  if (type === 'dropdown' || type === 'multiselect') {
    if (!base.options) base.options = 'Sim, Não, N/A';
  }
  if (raw.defaultValue != null && String(raw.defaultValue).trim()) {
    base.defaultValue = String(raw.defaultValue).trim();
  }
  if (raw.allowTechnicianComment === true) base.allowTechnicianComment = true;
  return base;
}

/**
 * @param {unknown} arr
 * @returns {{ schemaData: object[], warnings: string[] }}
 */
function normalizeSchemaDataFromLlm(arr) {
  const warnings = [];
  if (!Array.isArray(arr)) {
    warnings.push('schemaData não era array — devolvido formulário vazio.');
    return { schemaData: [], warnings };
  }
  const usedIds = new Set();
  const schemaData = [];
  for (const raw of arr) {
    const n = normalizeSchemaItem(raw, usedIds);
    if (n) schemaData.push(n);
  }
  if (schemaData.length === 0) {
    warnings.push('Nenhum campo válido após normalização.');
  }
  return { schemaData, warnings };
}

function sanitizeTemplateText(s, maxLen) {
  if (s == null) return '';
  let t = String(s).trim();
  if (t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}

function normalizeLabelKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Cabeçalho da coluna corresponde ao rótulo que a IA deu ao campo?
 */
function headerMatchesFieldLabel(header, fieldLabel) {
  const h = normalizeLabelKey(header);
  const l = normalizeLabelKey(fieldLabel);
  if (!h || !l) return false;
  if (h === l) return true;
  if (l.includes(h) || h.includes(l)) return true;
  const a = h.length <= l.length ? h : l;
  const b = h.length > l.length ? h : l;
  if (a.length >= 4 && b.includes(a)) return true;
  return false;
}

function findBestColumnSignalForItem(item, columnSignals) {
  if (!item || item.kind !== 'field' || !Array.isArray(columnSignals)) return null;
  const label = item.label || '';
  let best = null;
  for (const p of columnSignals) {
    if (!p || !p.header) continue;
    if (!headerMatchesFieldLabel(p.header, label)) continue;
    const rank = {
      barcode_hint: 6,
      yes_no: 5,
      dropdown: 4,
      multiselect_hint: 4,
      dropdown_weak: 3,
      photo_hint: 3,
      email_hint: 2,
      phone_hint: 2,
      date_hint: 2,
      number_hint: 2,
      none: 0,
    };
    const r = rank[p.signal] || 0;
    if (!best || r > (rank[best.signal] || 0)) best = p;
  }
  return best;
}

function ensureProposalOptionType(options, kind, type, shortLabel, hint) {
  const arr = Array.isArray(options) ? options : [];
  const exists = arr.some((o) => o && o.type === type);
  if (exists) return arr;
  const key = `opt_${type}_${Math.random().toString(36).slice(2, 9)}`;
  const extra = {
    key,
    type,
    shortLabel: shortLabel || type,
    hint: hint || '',
    ...(kind === 'section_break' && type === 'section_break' ? { multiple: false } : {}),
  };
  return [...arr, extra];
}

/**
 * Corrige recomendações da IA com base em estatísticas das colunas (dropdown vs texto, etc.).
 * @param {object[]} items
 * @param {object[]} columnSignals
 * @param {Record<string, unknown>} [formContext]
 * @returns {{ items: object[], warnings: string[] }}
 */
function applyColumnSignalsToProposals(items, columnSignals, formContext = {}) {
  const warnings = [];
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
  if (!Array.isArray(items) || !items.length) return { items: items || [], warnings };
  if (!Array.isArray(columnSignals) || !columnSignals.length) return { items, warnings };

  const next = items.map((item) => {
    if (!item || item.kind !== 'field') return item;
    const sig = findBestColumnSignalForItem(item, columnSignals);
    if (!sig || sig.signal === 'none') return item;

    let options = [...(item.options || [])];
    let suggestedOptions = item.suggestedOptions || '';
    const prevRecommended = item.recommendedOptionKey;
    let recommendedOptionKey = prevRecommended;

    const pickFirstKeyOfType = (t) => {
      const o = options.find((x) => x && x.type === t);
      return o ? o.key : null;
    };

    if (sig.signal === 'yes_no') {
      options = ensureProposalOptionType(options, 'field', 'yes_no', 'Sim / Não', 'Coluna com dois valores fixos');
      const k = pickFirstKeyOfType('yes_no');
      if (k) recommendedOptionKey = k;
      if (!suggestedOptions && sig.suggestedOptionsLine) suggestedOptions = sig.suggestedOptionsLine;
    } else if (sig.signal === 'dropdown' || sig.signal === 'dropdown_weak') {
      options = ensureProposalOptionType(
        options,
        'field',
        'dropdown',
        'Lista (dropdown)',
        'Valores repetem-se na coluna — lista fechada'
      );
      const k = pickFirstKeyOfType('dropdown');
      if (k) recommendedOptionKey = k;
      if (sig.suggestedOptionsLine) {
        suggestedOptions = suggestedOptions || sig.suggestedOptionsLine;
      }
    } else if (sig.signal === 'multiselect_hint') {
      options = ensureProposalOptionType(
        options,
        'field',
        'multiselect',
        'Múltipla escolha',
        'Células com vários valores separados por vírgula/;'
      );
      const k = pickFirstKeyOfType('multiselect');
      if (k) recommendedOptionKey = k;
      if (sig.suggestedOptionsLine) suggestedOptions = suggestedOptions || sig.suggestedOptionsLine;
    } else if (sig.signal === 'email_hint') {
      options = ensureProposalOptionType(options, 'field', 'email', 'E-mail', 'Valores parecem e-mails');
      const k = pickFirstKeyOfType('email');
      if (k) recommendedOptionKey = k;
    } else if (sig.signal === 'phone_hint') {
      options = ensureProposalOptionType(options, 'field', 'phone', 'Telefone', 'Cabeçalho sugere contacto');
      const k = pickFirstKeyOfType('phone');
      if (k) recommendedOptionKey = k;
    } else if (sig.signal === 'date_hint') {
      options = ensureProposalOptionType(options, 'field', 'date', 'Data', 'Valores parecem datas');
      const k = pickFirstKeyOfType('date');
      if (k) recommendedOptionKey = k;
    } else if (sig.signal === 'number_hint') {
      options = ensureProposalOptionType(options, 'field', 'number', 'Número', 'Valores maioritariamente numéricos');
      const k = pickFirstKeyOfType('number');
      if (k) recommendedOptionKey = k;
    } else if (sig.signal === 'barcode_hint') {
      options = ensureProposalOptionType(
        options,
        'field',
        'barcode_scan',
        'Código de barras',
        'Coluna sugere identificador / EAN / património'
      );
      const k = pickFirstKeyOfType('barcode_scan');
      if (k) recommendedOptionKey = k;
    } else if (sig.signal === 'photo_hint') {
      const wantStamped = ctx.requireStampedPhotos === true;
      const pType = wantStamped ? 'photo_stamped' : 'photo';
      const pLabel = wantStamped ? 'Foto carimbada' : 'Fotografia';
      options = ensureProposalOptionType(options, 'field', pType, pLabel, 'Cabeçalho sugere evidência fotográfica');
      const k = pickFirstKeyOfType(pType);
      if (k) recommendedOptionKey = k;
    }

    const keys = new Set();
    options = options.map((o, j) => {
      let k = o.key;
      while (keys.has(k)) k = `${k}_${j}`;
      keys.add(k);
      return { ...o, key: k };
    });
    if (!options.some((o) => o.key === recommendedOptionKey)) {
      recommendedOptionKey = options[0].key;
    }

    if (recommendedOptionKey !== prevRecommended) {
      warnings.push(`Campo «${item.label}»: tipo sugerido ajustado com base nos dados da coluna (perfil: ${sig.signal}).`);
    }

    return {
      ...item,
      options,
      suggestedOptions,
      recommendedOptionKey,
    };
  });

  return { items: next, warnings };
}

/**
 * Ajusta schema já normalizado (fluxo directo LLM → schema) com o mesmo perfil de colunas.
 */
function applyColumnSignalsToSchemaData(schemaData, columnSignals, formContext = {}) {
  const warnings = [];
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
  if (!Array.isArray(schemaData) || !columnSignals?.length) return { schemaData, warnings };
  const out = schemaData.map((f) => {
    if (!f || f.type === 'section_break') return f;
    const sig = findBestColumnSignalForItem({ kind: 'field', label: f.label }, columnSignals);
    if (!sig || sig.signal === 'none') return f;
    const next = { ...f };
    const was = next.type;
    if (sig.signal === 'barcode_hint' && (was === 'text' || was === 'number')) {
      next.type = 'barcode_scan';
      next.options = null;
      warnings.push(`«${f.label}»: tipo alterado para leitura de código de barras (perfil da coluna).`);
    } else if (sig.signal === 'photo_hint' && was === 'text') {
      next.type = ctx.requireStampedPhotos === true ? 'photo_stamped' : 'photo';
      next.options = null;
      warnings.push(`«${f.label}»: tipo alterado para ${next.type} (cabeçalho sugere foto).`);
    } else if ((sig.signal === 'dropdown' || sig.signal === 'dropdown_weak') && was === 'text') {
      next.type = 'dropdown';
      next.options = sig.suggestedOptionsLine || next.options || 'Opção 1, Opção 2';
      warnings.push(`«${f.label}»: tipo alterado para lista (dropdown) com base nos dados.`);
    } else if (sig.signal === 'yes_no' && was === 'text') {
      next.type = 'yes_no';
      next.options = null;
      warnings.push(`«${f.label}»: tipo alterado para Sim/Não.`);
    } else if (sig.signal === 'multiselect_hint' && was === 'text') {
      next.type = 'multiselect';
      next.options = sig.suggestedOptionsLine || next.options || 'A, B, C';
      warnings.push(`«${f.label}»: tipo alterado para múltipla escolha.`);
    } else if (sig.signal === 'email_hint' && was === 'text') {
      next.type = 'email';
      next.options = null;
    } else if (sig.signal === 'phone_hint' && was === 'text') {
      next.type = 'phone';
      next.options = null;
    } else if (sig.signal === 'date_hint' && was === 'text') {
      next.type = 'date';
      next.options = null;
    } else if (sig.signal === 'number_hint' && was === 'text') {
      next.type = 'number';
      next.options = null;
    }
    return next;
  });
  return { schemaData: out, warnings };
}

function normalizeProposalOption(raw, kind) {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : null;
  let type = String(raw.type || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (kind === 'section_break') {
    if (type !== 'section_break') type = 'section_break';
    const multiple = raw.multiple === true || raw.multiple === 'true';
    return {
      key: key || `opt_${Math.random().toString(36).slice(2, 9)}`,
      type: 'section_break',
      shortLabel: String(raw.shortLabel || raw.label || (multiple ? 'Lista repetível' : 'Etapa única')).trim(),
      hint: raw.hint != null ? String(raw.hint).trim() : '',
      multiple,
    };
  }
  if (!ALLOWED_FIELD_TYPES.has(type) || type === 'section_break') type = 'text';
  return {
    key: key || `opt_${Math.random().toString(36).slice(2, 9)}`,
    type,
    shortLabel: String(raw.shortLabel || raw.label || type).trim() || type,
    hint: raw.hint != null ? String(raw.hint).trim() : '',
  };
}

/**
 * Valida e normaliza a lista de itens devolvida pela fase «analisar planilha».
 * @param {unknown} parsed
 * @returns {{ items: object[], warnings: string[] }}
 */
function normalizeProposalsFromLlm(parsed) {
  const warnings = [];
  const rawItems = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.items : null;
  const arr = Array.isArray(rawItems) ? rawItems : [];
  if (arr.length === 0) {
    warnings.push('A IA não devolveu itens (lista vazia).');
    return { items: [], warnings };
  }
  const items = [];
  arr.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const kRaw = String(raw.kind || raw.itemKind || '').toLowerCase();
    const kind =
      kRaw === 'section_break' ||
      kRaw === 'section' ||
      raw.type === 'section_break'
        ? 'section_break'
        : 'field';
    const key = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : `item_${i}`;
    const label = String(raw.label || raw.title || (kind === 'section_break' ? 'Etapa' : 'Campo')).trim();
    const context = raw.context != null ? String(raw.context).trim().slice(0, 500) : '';
    let options = Array.isArray(raw.options) ? raw.options.map((o) => normalizeProposalOption(o, kind)).filter(Boolean) : [];
    if (kind === 'section_break') {
      if (options.length < 2) {
        options = [
          { key: `${key}_once`, type: 'section_break', shortLabel: 'Etapa única', hint: '', multiple: false },
          { key: `${key}_rep`, type: 'section_break', shortLabel: 'Lista repetível', hint: '', multiple: true },
        ];
        warnings.push(`Secção «${label}»: opções geradas por defeito.`);
      }
    } else if (options.length < 2) {
      options = [
        { key: `${key}_text`, type: 'text', shortLabel: 'Texto livre', hint: '' },
        { key: `${key}_num`, type: 'number', shortLabel: 'Número', hint: '' },
      ];
      warnings.push(`Campo «${label}»: opções de tipo geradas por defeito.`);
    }
    const keys = new Set();
    options = options.map((o, j) => {
      let k = o.key;
      while (keys.has(k)) k = `${k}_${j}`;
      keys.add(k);
      return { ...o, key: k };
    });
    let recommendedOptionKey = typeof raw.recommendedOptionKey === 'string' ? raw.recommendedOptionKey.trim() : '';
    if (!recommendedOptionKey || !options.some((o) => o.key === recommendedOptionKey)) {
      recommendedOptionKey = options[0].key;
    }
    let suggestedOptions = '';
    if (raw.suggestedOptions != null) {
      if (Array.isArray(raw.suggestedOptions)) {
        suggestedOptions = raw.suggestedOptions.map((x) => String(x).trim()).filter(Boolean).join(', ');
      } else {
        suggestedOptions = String(raw.suggestedOptions).trim();
      }
    }
    if (suggestedOptions.length > 2000) suggestedOptions = suggestedOptions.slice(0, 2000);
    items.push({
      key,
      kind,
      label,
      context,
      recommendedOptionKey,
      options,
      suggestedOptions,
    });
  });
  return { items, warnings };
}

/**
 * Monta schemaData a partir das propostas confirmadas pelo utilizador (sem segunda chamada LLM).
 * @param {object[]} items — saída de normalizeProposalsFromLlm
 * @param {Record<string, { optionKey?: string, required?: boolean, options?: string }>} selections
 */
function buildSchemaFromProposalSelections(items, selections) {
  const warnings = [];
  const usedIds = new Set();
  const schemaData = [];
  const sel = selections && typeof selections === 'object' ? selections : {};

  for (const item of items) {
    const s = sel[item.key] || {};
    const optionKey = typeof s.optionKey === 'string' && s.optionKey.trim() ? s.optionKey.trim() : item.recommendedOptionKey;
    const opt = (item.options || []).find((o) => o.key === optionKey) || item.options[0];
    if (!opt) {
      warnings.push(`Item «${item.label}»: opção em falta — ignorado.`);
      continue;
    }
    if (item.kind === 'section_break') {
      const multiple = opt.multiple === true;
      const n = normalizeSchemaItem(
        { type: 'section_break', label: item.label, multiple },
        usedIds
      );
      if (n) schemaData.push(n);
    } else {
      const required = s.required === true || s.required === 'true';
      const raw = { type: opt.type, label: item.label, required };
      if (opt.type === 'dropdown' || opt.type === 'multiselect') {
        const fromUser = s.options != null ? String(s.options).trim() : '';
        const merged = fromUser || item.suggestedOptions || '';
        if (merged) raw.options = merged;
      }
      const n = normalizeSchemaItem(raw, usedIds);
      if (n) schemaData.push(n);
    }
  }
  if (schemaData.length === 0) {
    warnings.push('Nenhum campo no formulário após confirmação.');
  }
  return { schemaData, warnings };
}

module.exports = {
  ALLOWED_FIELD_TYPES,
  normalizeSchemaDataFromLlm,
  normalizeSchemaItem,
  sanitizeTemplateText,
  normalizeLabelKey,
  normalizeProposalsFromLlm,
  buildSchemaFromProposalSelections,
  applyColumnSignalsToProposals,
  applyColumnSignalsToSchemaData,
};
