'use strict';

const {
  ALLOWED_FIELD_TYPES,
  buildDefaultAnalyzeProposalOptions,
  applyDefaultTypeIconsToSchemaItems,
} = require('./formAiFieldCatalog');
const {
  MAX_VISION_STRUCTURED_PROMPT_CHARS,
  MAX_VISION_SIMNAO_QUESTIONS,
} = require('../constants/visionSimNaoQuestions');

/** Alinhado a `fb_prop_vision_default_structured_prompt` (Visão de IA — análise / Gemini). */
const DEFAULT_VISION_ANALYSIS_PROMPT =
  'Contexto: inspeção visual de uma etapa executada em campo (foto ou vídeo único).\n\n' +
  'Tarefa:\n' +
  '1) Atribua uma nota inteira de 0 a 10 à aderência da evidência visual aos critérios desta etapa da OS.\n' +
  '2) Baseie-se apenas no visível: presença do item ou serviço esperado, estado aparente, organização e gravidade de eventuais não conformidades.\n\n' +
  'Campo value (obrigatório):\n' +
  '- Envie somente os dígitos de um inteiro entre 0 e 10, como string (ex.: "7").\n' +
  '- Ou envie exatamente unknown se a mídia for insuficiente, o alvo não estiver identificável ou houver ambiguidade relevante.\n\n' +
  'Rubrica orientativa:\n' +
  '- 0–2: inaceitável ou evidência irrelevante; não conformidade grave ou evidente.\n' +
  '- 3–4: vários problemas visíveis ou qualidade fraca da evidência.\n' +
  '- 5–6: aceitável com ressalvas; melhorias necessárias.\n' +
  '- 7–8: bom estado geral; apenas falhas leves.\n' +
  '- 9–10: excelente; critérios da etapa inequivocamente atendidos.\n\n' +
  'No rationale, em 2–4 frases curtas em pt-BR, diga o que foi observado e o que mais pesou na nota.';

/**
 * Garante que cada campo tem uma paleta completa de tipos (IA + catálogo BrSpark), sem duplicar por `type`.
 * @param {string} itemKey
 * @param {object[]} options — já normalizados
 * @param {Record<string, unknown>} [formContext]
 */
function mergeFieldOptionsWithAnalyzePalette(itemKey, options, formContext) {
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
  const palette = buildDefaultAnalyzeProposalOptions(ctx);
  const byType = new Map();
  const order = [];
  for (const o of options) {
    if (!o || !o.type) continue;
    if (!byType.has(o.type)) {
      byType.set(o.type, o);
      order.push(o.type);
    }
  }
  for (const p of palette) {
    if (!byType.has(p.type)) {
      byType.set(p.type, {
        key: `${itemKey}_pal_${p.type}`,
        type: p.type,
        shortLabel: p.shortLabel,
        hint: p.hint || '',
      });
      order.push(p.type);
    }
  }
  if (order.length === 0) {
    return palette.map((p, j) => ({
      key: `${itemKey}_pal_${p.type}_${j}`,
      type: p.type,
      shortLabel: p.shortLabel,
      hint: p.hint || '',
    }));
  }
  return order.map((t) => byType.get(t)).filter(Boolean);
}

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
    geofenceGeometryToleranceM: t === 'geofence_check' ? '150' : null,
    geofenceSegmentBufferM: t === 'geofence_check' ? '150' : null,
    options: t === 'dropdown' || t === 'multiselect' ? 'Opção 1, Opção 2' : null,
    calcFormula: t === 'calculated' ? '' : null,
    textMask: t === 'text' || t === 'number' || t === 'phone' ? '' : null,
    description: '',
    helpHtml: '',
    showFieldInstructions: false,
    defaultValue: '',
    icon: '',
    iconLibrary: 'Ionicons',
    iconColor: '',
    allowTechnicianComment: false,
    allowMediaDescription: false,
    ...(t === 'section_break' ? { sectionFillMode: 'list' } : {}),
    ...(t === 'vision_checklist'
      ? {
          visionStructuredPrompt: DEFAULT_VISION_ANALYSIS_PROMPT,
          visionQuestions: [{ id: 'q1', text: DEFAULT_VISION_ANALYSIS_PROMPT }],
          visionCaptureMode: 'photo_and_video',
          visionAnalysisGrid: '1x1',
          visionRating0To10Enabled: true,
          visionShowAiResponseInForm: true,
        }
      : {}),
    ...(t === 'vision_ai_analysis'
      ? {
          visionStructuredPrompt: DEFAULT_VISION_ANALYSIS_PROMPT,
          visionQuestions: [{ id: 'q1', text: DEFAULT_VISION_ANALYSIS_PROMPT }],
          visionCaptureMode: 'photo_and_video',
        }
      : {}),
    ...(t === 'vision_ai_analysis'
      ? {
          visionAnalysisGrid: '1x1',
          visionRating0To10Enabled: true,
          visionShowAiResponseInForm: true,
        }
      : {}),
    ...(t === 'leitura' ? { contentHtml: '', required: false } : {}),
    ...(t === 'voice_note' ? { voiceTranscribeLanguage: 'pt' } : {}),
    ...(t === 'image_annotation'
      ? {
          annotationPenColor: '#dc2626',
          annotationStrokeWidth: 4,
        }
      : {}),
    ...(t === 'lookup_select'
      ? {
          lookupSource: 'preset',
          lookupPreset: 'equipamentos_demo',
          lookupInlineJson: '',
          lookupApiPath: '/api/checklists/lookup-options/equipamentos_demo',
        }
      : {}),
    ...(t === 'repeatable_matrix'
      ? {
          matrixColumns: [
            { id: 'c1', label: 'Item', cellType: 'text' },
            { id: 'c2', label: 'Valor', cellType: 'number' },
          ],
          matrixMinRows: '0',
          matrixMaxRows: '20',
        }
      : {}),
    ...(t === 'opinion_scale'
      ? {
          opinionScaleMode: 'nps',
          likertLabels:
            'Discordo totalmente\nDiscordo\nNeutro\nConcordo\nConcordo totalmente',
        }
      : {}),
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
  if (raw.icon != null && String(raw.icon).trim()) {
    base.icon = String(raw.icon).trim();
    base.iconLibrary = raw.iconLibrary != null ? String(raw.iconLibrary).trim() || 'Ionicons' : 'Ionicons';
    if (raw.iconColor != null && String(raw.iconColor).trim()) base.iconColor = String(raw.iconColor).trim();
  } else if (raw.iconLibrary != null && String(raw.iconLibrary).trim()) {
    base.iconLibrary = String(raw.iconLibrary).trim();
  }
  if (type === 'signature_summary') {
    base.summarySourceFieldIds = Array.isArray(raw.summarySourceFieldIds)
      ? raw.summarySourceFieldIds.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
  }
  if (type === 'vision_checklist' || type === 'vision_ai_analysis') {
    const rawVq = raw.visionQuestions ?? raw.vision_questions;
    const parseVisionQuestionItems = () => {
      if (!Array.isArray(rawVq) || !rawVq.length) return [];
      return rawVq
        .map((x, i) => {
          const text = String(x?.text || x?.question || '').trim();
          if (!text) return null;
          const id = String(x?.id || `q${i + 1}`)
            .replace(/[^\w-]/g, '_')
            .slice(0, 64);
          return { id, text };
        })
        .filter(Boolean)
        .slice(0, MAX_VISION_SIMNAO_QUESTIONS);
    };

    {
      let structured =
        raw.visionStructuredPrompt != null ? String(raw.visionStructuredPrompt).trim() : '';
      if (!structured) {
        const items = parseVisionQuestionItems();
        if (items.length) {
          structured = items
            .map((x) => x.text)
            .join('\n\n');
        }
      }
      if (!structured) structured = DEFAULT_VISION_ANALYSIS_PROMPT;
      structured = structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
      base.visionStructuredPrompt = structured;
      base.visionQuestions = [{ id: 'q1', text: structured }];
    }
    const vcm = raw.visionCaptureMode ?? raw.vision_capture_mode;
    if (typeof vcm === 'string') {
      const m = vcm.trim();
      if (m === 'photo_only' || m === 'video_only' || m === 'photo_and_video') {
        base.visionCaptureMode = m;
      }
    }
    if (type === 'vision_ai_analysis' || type === 'vision_checklist') {
      const grid = raw.visionAnalysisGrid ?? raw.vision_analysis_grid;
      if (typeof grid === 'string') {
        const g = grid.trim().toLowerCase().replace(/\*/g, 'x');
        if (g === '1x1' || g === '2x2') {
          base.visionAnalysisGrid = g;
        } else if (['2x1', '3x1', '3x2', '3x3'].includes(g)) {
          base.visionAnalysisGrid = '2x2';
        }
      }
      if (!base.visionAnalysisGrid) base.visionAnalysisGrid = '1x1';
      const vr = raw.visionRating0To10Enabled ?? raw.vision_rating_0_to_10_enabled;
      base.visionRating0To10Enabled =
        vr === true || vr === 'true' || vr === 1 || vr === '1' || vr === 'on';
      const vsr = raw.visionShowAiResponseInForm ?? raw.vision_show_ai_response_in_form;
      base.visionShowAiResponseInForm =
        vsr === false || vsr === 'false' || vsr === 0 || vsr === '0' || vsr === 'off' || vsr === 'no'
          ? false
          : true;
    }
  }
  if (type === 'leitura') {
    base.required = false;
    if (raw.contentHtml != null) base.contentHtml = String(raw.contentHtml).slice(0, 500000);
  }
  if (type === 'voice_note') {
    const lang = raw.voiceTranscribeLanguage ?? raw.voice_transcribe_language;
    if (typeof lang === 'string' && lang.trim()) {
      base.voiceTranscribeLanguage = String(lang).trim().slice(0, 12);
    }
  }
  if (type === 'image_annotation') {
    if (raw.annotationPenColor != null) base.annotationPenColor = String(raw.annotationPenColor).trim().slice(0, 20);
    if (raw.annotationStrokeWidth != null) {
      const sw = parseInt(String(raw.annotationStrokeWidth), 10);
      if (Number.isFinite(sw) && sw >= 1 && sw <= 24) base.annotationStrokeWidth = sw;
    }
  }
  if (type === 'lookup_select') {
    const src = raw.lookupSource ?? raw.lookup_source;
    if (src === 'inline_json' || src === 'preset' || src === 'api') base.lookupSource = String(src);
    if (raw.lookupPreset != null) base.lookupPreset = String(raw.lookupPreset).trim().slice(0, 80);
    if (raw.lookupInlineJson != null) base.lookupInlineJson = String(raw.lookupInlineJson).slice(0, 120000);
    if (raw.lookupApiPath != null) {
      const p = String(raw.lookupApiPath).trim().slice(0, 240);
      base.lookupApiPath = p ? (p.startsWith('/') ? p : `/${p}`) : '';
    }
  }
  if (type === 'repeatable_matrix') {
    const mc = raw.matrixColumns ?? raw.matrix_columns;
    if (Array.isArray(mc) && mc.length) {
      base.matrixColumns = mc
        .map((x, i) => {
          if (!x || typeof x !== 'object') return null;
          const id = String(x.id || `c${i + 1}`)
            .replace(/[^\w-]/g, '_')
            .slice(0, 48);
          const label = String(x.label || x.title || '').trim().slice(0, 120);
          const ct = String(x.cellType || x.cell_type || 'text')
            .trim()
            .toLowerCase();
          const cellType = ct === 'number' || ct === 'yes_no' ? ct : 'text';
          if (!label) return null;
          return { id, label, cellType };
        })
        .filter(Boolean)
        .slice(0, 8);
    }
    if (!base.matrixColumns || !base.matrixColumns.length) {
      base.matrixColumns = [
        { id: 'c1', label: 'Item', cellType: 'text' },
        { id: 'c2', label: 'Valor', cellType: 'number' },
      ];
    }
    const minR = raw.matrixMinRows ?? raw.matrix_min_rows;
    const maxR = raw.matrixMaxRows ?? raw.matrix_max_rows;
    if (minR != null) base.matrixMinRows = String(minR).trim().slice(0, 8);
    if (maxR != null) base.matrixMaxRows = String(maxR).trim().slice(0, 8);
  }
  if (type === 'opinion_scale') {
    const mode = raw.opinionScaleMode ?? raw.opinion_scale_mode;
    if (mode === 'likert' || mode === 'nps') base.opinionScaleMode = String(mode);
    if (raw.likertLabels != null) base.likertLabels = String(raw.likertLabels).slice(0, 2000);
  }
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
  } else {
    applyDefaultTypeIconsToSchemaItems(schemaData);
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
        'Coluna sugere identificador / EAN / patrimônio'
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
      warnings.push(`Campo "${item.label}": tipo sugerido ajustado com base nos dados da coluna (perfil: ${sig.signal}).`);
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
      warnings.push(`"${f.label}": tipo alterado para leitura de código de barras (perfil da coluna).`);
    } else if (sig.signal === 'photo_hint' && was === 'text') {
      next.type = ctx.requireStampedPhotos === true ? 'photo_stamped' : 'photo';
      next.options = null;
      warnings.push(`"${f.label}": tipo alterado para ${next.type} (cabeçalho sugere foto).`);
    } else if ((sig.signal === 'dropdown' || sig.signal === 'dropdown_weak') && was === 'text') {
      next.type = 'dropdown';
      next.options = sig.suggestedOptionsLine || next.options || 'Opção 1, Opção 2';
      warnings.push(`"${f.label}": tipo alterado para lista (dropdown) com base nos dados.`);
    } else if (sig.signal === 'yes_no' && was === 'text') {
      next.type = 'yes_no';
      next.options = null;
      warnings.push(`"${f.label}": tipo alterado para Sim/Não.`);
    } else if (sig.signal === 'multiselect_hint' && was === 'text') {
      next.type = 'multiselect';
      next.options = sig.suggestedOptionsLine || next.options || 'A, B, C';
      warnings.push(`"${f.label}": tipo alterado para múltipla escolha.`);
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

/**
 * Estrutura vinda da IA (só seções + campos, sem opções de tipo).
 * Aceita "blocks" ou legado "items".
 * @param {unknown} parsed
 * @returns {{ blocks: object[], warnings: string[] }}
 */
function normalizeStructureBlocksFromLlm(parsed) {
  const warnings = [];
  let arr = [];
  if (parsed && Array.isArray(parsed.blocks)) {
    arr = parsed.blocks;
  } else if (parsed && Array.isArray(parsed.items)) {
    arr = parsed.items.map((it, i) => ({
      key: it.key,
      kind: it.kind,
      label: it.label,
      context: it.context,
      suggestedType: it.suggestedType,
      suggestedListOptions: it.suggestedListOptions,
    }));
    if (arr.length) warnings.push('Resposta em formato antigo (items) — tratada como blocos de estrutura.');
  }
  if (arr.length === 0) {
    warnings.push('A IA não devolveu blocos (estrutura vazia).');
    return { blocks: [], warnings };
  }
  const keys = new Set();
  const blocks = [];
  arr.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const kRaw = String(raw.kind || '').toLowerCase();
    const kind = kRaw === 'section_break' || kRaw === 'section' || raw.type === 'section_break' ? 'section_break' : 'field';
    let key = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : `b${i}`;
    while (keys.has(key)) key = `${key}_${i}`;
    keys.add(key);
    const label =
      String(raw.label || raw.title || (kind === 'section_break' ? 'Etapa' : 'Campo')).trim() ||
      (kind === 'section_break' ? 'Etapa' : 'Campo');
    const context = raw.context != null ? String(raw.context).trim().slice(0, 500) : '';
    /** @type {Record<string, unknown>} */
    const block = { key, kind, label, context };
    if (kind === 'field') {
      let st =
        raw.suggestedType != null
          ? String(raw.suggestedType)
              .trim()
              .toLowerCase()
              .replace(/[\s-]+/g, '_')
          : '';
      if (st && !ALLOWED_FIELD_TYPES.has(st)) st = '';
      if (st) block.suggestedType = st;
      const slo = raw.suggestedListOptions != null ? String(raw.suggestedListOptions).trim().slice(0, 2000) : '';
      if (slo) block.suggestedListOptions = slo;
    }
    blocks.push(block);
  });
  return { blocks, warnings };
}

/**
 * @param {object[]} blocks
 * @param {object[]} columnSignals
 * @param {Record<string, unknown>} [formContext]
 * @returns {object[]}
 */
function applyColumnSignalsToStructureBlocks(blocks, columnSignals, formContext = {}) {
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
  if (!Array.isArray(blocks) || !columnSignals?.length) return blocks;
  return blocks.map((b) => {
    if (!b || b.kind !== 'field') return b;
    const sig = findBestColumnSignalForItem({ kind: 'field', label: b.label }, columnSignals);
    if (!sig || sig.signal === 'none') return b;
    const out = { ...b };
    if (sig.signal === 'dropdown' || sig.signal === 'dropdown_weak') {
      out.suggestedType = 'dropdown';
      if (sig.suggestedOptionsLine) out.suggestedListOptions = sig.suggestedOptionsLine;
    } else if (sig.signal === 'yes_no') {
      out.suggestedType = 'yes_no';
    } else if (sig.signal === 'multiselect_hint') {
      out.suggestedType = 'multiselect';
      if (sig.suggestedOptionsLine) out.suggestedListOptions = sig.suggestedOptionsLine;
    } else if (sig.signal === 'email_hint') {
      out.suggestedType = 'email';
    } else if (sig.signal === 'phone_hint') {
      out.suggestedType = 'phone';
    } else if (sig.signal === 'date_hint') {
      out.suggestedType = 'date';
    } else if (sig.signal === 'number_hint') {
      out.suggestedType = 'number';
    } else if (sig.signal === 'barcode_hint') {
      out.suggestedType = 'barcode_scan';
    } else if (sig.signal === 'photo_hint') {
      out.suggestedType = ctx.requireStampedPhotos === true ? 'photo_stamped' : 'photo';
    }
    return out;
  });
}

/**
 * Infere tipo de campo a partir do rótulo (pt-BR / EN) quando não há perfil de coluna Excel.
 * Respeita contexto do assistente (ex.: foto carimbada).
 * @param {string} label
 * @param {Record<string, unknown>} [formContext]
 * @returns {string} tipo ou ''
 */
function inferSuggestedFieldTypeFromLabel(label, formContext = {}) {
  const raw = String(label || '').trim();
  if (!raw) return '';
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
  const stamped = ctx.requireStampedPhotos === true;
  const n = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const has = (re) => re.test(raw) || re.test(n);

  if (has(/\b(biometr|reconhecimento\s*f[aá]cial|valida(c|ç)[aã]o\s*f[aá]cial|face\s*id)\b/i))
    return 'facial_recognition';
  if (has(/\b(cerca|geofence|validar\s*local|localiza(c|ç)[aã]o\s*\(?gps|dentro\s*da\s*zona)\b/i))
    return 'geofence_check';
  if (has(/\b(resumo\s*para\s*assinatura|assinatura\s*com\s*resumo|confer[eê]ncia\s*e\s*assinatura)\b/i))
    return 'signature_summary';
  if (has(/\b(assinatur|firma\s*do|firma\s*digital|rubrica)\b/i)) return 'signature';
  if (has(/\b(c[oó]digo\s*de\s*barras|\bean\b|\bgtin\b|patrim[oô]nio|n[ºo°]?\s*ser(i[eê])?|\bsku\b)\b/i))
    return 'barcode_scan';

  if (has(/\b(foto\s*carimb|gps\s*obrig|carimbo\s*gps|evid[eê]ncia\s*carimb)\b/i)) return 'photo_stamped';
  if (has(/\bfoto(s)?\b|\bfotografia\b|\bimagem(ns)?\b|\bevid[eê]ncia(\s*fotogr[aá]fica)?\b|\bcaptura\b|\bpicture\b|\bphoto\b|\bsnapshot\b/i)) {
    return stamped ? 'photo_stamped' : 'photo';
  }

  if (
    has(/\b(anexo|arquivo|pdf|upload|ficheiro|documento\s*adj)\b/i) &&
    !has(/\b(foto|imagem|fotogr)\b/i)
  ) {
    return 'file_upload';
  }

  if (has(/\b(e-?mail|correio\s*ele)\b/i)) return 'email';
  if (has(/\b(telefone|telem[oó]vel|celular|whatsapp|fone|contacto\s*tel)\b/i)) return 'phone';
  if (has(/\b(data\s|data\/|data:|dt\.|\bprazo\b|\bvenciment|\bhor[aá]rio\b|\bhora\s*d)\b/i)) return 'date';
  if (
    has(
      /\b(quantidade|qtd\.?|valor\s|r\$|pre(c|ç)o|peso|km\b|metros\b|temp(eratura)?|press[aã]o|n[ºo°]\s|numero|n[uú]mero\s*de)\b/i
    )
  ) {
    return 'number';
  }
  if (
    has(
      /\b(conforme|aprovad|reprovad|sim\s*\/\s*n[aã]o|cumpre|n[aã]o\s*conform|ok\s*\?|check\s*list)\b/i
    )
  ) {
    return 'yes_no';
  }
  if (has(/\b(avalia(c|ç)[aã]o|nota\s|estrelas|satisfa(c|ç)[aã]o|\bnps\b)\b/i)) return 'rating';

  return '';
}

/**
 * Preenche ou corrige suggestedType a partir do rótulo (não sobrescreve tipos fortes vindos do perfil Excel).
 * @param {object[]} blocks
 * @param {Record<string, unknown>} [formContext]
 * @returns {object[]}
 */
function applyLabelHeuristicsToStructureBlocks(blocks, formContext = {}) {
  if (!Array.isArray(blocks) || !blocks.length) return blocks;
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
  return blocks.map((b) => {
    if (!b || b.kind !== 'field') return b;
    const inferred = inferSuggestedFieldTypeFromLabel(b.label, ctx);
    if (!inferred || !ALLOWED_FIELD_TYPES.has(inferred)) return b;
    const cur = String(b.suggestedType || '').trim();
    if (!cur) {
      const out = { ...b, suggestedType: inferred };
      if (inferred === 'yes_no' && !b.suggestedListOptions) {
        out.suggestedListOptions = 'Sim, Não';
      }
      return out;
    }
    if (cur === 'text' && inferred !== 'text') {
      const out = { ...b, suggestedType: inferred };
      if (inferred === 'yes_no' && !b.suggestedListOptions) {
        out.suggestedListOptions = 'Sim, Não';
      }
      return out;
    }
    return b;
  });
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
 * Valida e normaliza a lista de itens devolvida pela fase "analisar planilha".
 * @param {unknown} parsed
 * @param {Record<string, unknown>} [formContext] — tipos avançados na paleta conforme checkboxes do painel
 * @returns {{ items: object[], warnings: string[] }}
 */
function normalizeProposalsFromLlm(parsed, formContext) {
  const warnings = [];
  const rawItems = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.items : null;
  const arr = Array.isArray(rawItems) ? rawItems : [];
  if (arr.length === 0) {
    warnings.push('A IA não devolveu itens (lista vazia).');
    return { items: [], warnings };
  }
  const ctx = formContext && typeof formContext === 'object' ? formContext : {};
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
        warnings.push(`Seção "${label}": opções geradas por padrão.`);
      }
    } else {
      const thin = options.length < 2;
      options = mergeFieldOptionsWithAnalyzePalette(key, options, ctx);
      if (thin) {
        warnings.push(
          `Campo "${label}": a IA sugeriu poucos tipos — o menu foi alargado com os tipos habituais do BrSpark (pode escolher outro).`
        );
      }
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
 * Monta schemaData a partir das propostas confirmadas pelo usuário (sem segunda chamada LLM).
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
      warnings.push(`Item "${item.label}": opção ausente — ignorado.`);
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
  } else {
    applyDefaultTypeIconsToSchemaItems(schemaData);
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
  normalizeStructureBlocksFromLlm,
  applyColumnSignalsToStructureBlocks,
  buildSchemaFromProposalSelections,
  applyColumnSignalsToProposals,
  applyColumnSignalsToSchemaData,
  inferSuggestedFieldTypeFromLabel,
  applyLabelHeuristicsToStructureBlocks,
};
