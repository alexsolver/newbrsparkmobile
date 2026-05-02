'use strict';

const {
  MAX_VISION_SIMNAO_QUESTIONS,
  MAX_VISION_STRUCTURED_PROMPT_CHARS,
} = require('../constants/visionSimNaoQuestions');
const { ALLOWED_FIELD_TYPES } = require('./formAiFieldCatalog');
const { normalizeSchemaItem } = require('./formAiNormalize');

const MAX_OPS = 30;
const MAX_FIELDS = 250;
const MAX_FIELD_DESCRIPTION_CHARS = 500;

/** Sinónimos que o LLM usa em vez de `op` (único campo aceite no contrato original). */
const SCHEMA_PATCH_OP_ALIASES = {
  delete_field: 'remove_field',
  del_field: 'remove_field',
  remove: 'remove_field',
  rm_field: 'remove_field',
  edit_field: 'update_field',
  modify_field: 'update_field',
  change_field: 'update_field',
  patch_field: 'update_field',
  update: 'update_field',
  insert_field: 'add_field',
  create_field: 'add_field',
  new_field: 'add_field',
  append_field: 'add_field',
  add: 'add_field',
};

const OP_KEYS = ['op', 'operation', 'action', 'kind', 'verb'];

/**
 * Expande `add_fields` / lista solta de campos numa sequência de operações `add_field`.
 * @param {object[]} ops
 * @returns {object[]}
 */
function expandCopilotSchemaOperations(ops) {
  if (!Array.isArray(ops)) return [];
  const out = [];
  for (const raw of ops) {
    if (!raw || typeof raw !== 'object') continue;
    const op0 = String(raw.op || '').trim().toLowerCase();
    if (
      (op0 === 'add_field' || op0 === 'add_fields') &&
      Array.isArray(raw.fields) &&
      raw.fields.length &&
      (raw.field == null || typeof raw.field !== 'object')
    ) {
      for (const f of raw.fields) {
        if (f && typeof f === 'object') out.push({ op: 'add_field', field: f, afterId: raw.afterId });
      }
      continue;
    }
    if (Array.isArray(raw.fields) && raw.field == null && op0 !== 'update_field' && op0 !== 'remove_field') {
      const looksLikeOnlyFields =
        !raw.patch &&
        raw.id == null &&
        raw.fields.length > 0 &&
        raw.fields.every((x) => x && typeof x === 'object');
      if (looksLikeOnlyFields) {
        for (const f of raw.fields) out.push({ op: 'add_field', field: f, afterId: raw.afterId });
        continue;
      }
    }
    out.push(raw);
  }
  return out;
}

/**
 * Normaliza uma linha de `schemaPatch.operations` para o formato esperado pelo motor.
 * @param {object} raw
 * @returns {object|null}
 */
function normalizeCopilotSchemaPatchOperationRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = { ...raw };
  if (row.field == null && row.item && typeof row.item === 'object') row.field = row.item;
  if (row.field == null && row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
    row.field = row.data;
  }
  if (row.field == null && Array.isArray(row.fields) && row.fields.length === 1 && row.fields[0]) {
    row.field = row.fields[0];
  }
  if (row.patch == null && row.updates && typeof row.updates === 'object') row.patch = row.updates;
  if (row.patch == null && row.changes && typeof row.changes === 'object') row.patch = row.changes;
  if (row.id == null && row.fieldId != null) row.id = row.fieldId;
  if (row.id == null && row.targetId != null) row.id = row.targetId;

  let op = '';
  for (const k of OP_KEYS) {
    if (row[k] == null) continue;
    const v = String(row[k]).trim().toLowerCase();
    if (v) {
      op = v;
      break;
    }
  }
  if (!op && row.type != null) {
    const t = String(row.type).trim().toLowerCase();
    if (t === 'add_field' || t === 'update_field' || t === 'remove_field') op = t;
  }
  if (SCHEMA_PATCH_OP_ALIASES[op]) op = SCHEMA_PATCH_OP_ALIASES[op];

  if (!op && row.field && typeof row.field === 'object') op = 'add_field';

  if (
    !op &&
    row.id != null &&
    String(row.id).trim() &&
    row.patch &&
    typeof row.patch === 'object' &&
    Object.keys(row.patch).length
  ) {
    op = 'update_field';
  }

  if (!op && row.id != null && String(row.id).trim() && row.remove === true) op = 'remove_field';

  if (!op) {
    const t = row.type != null ? String(row.type).trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
    if (t && ALLOWED_FIELD_TYPES.has(t)) op = 'add_field';
  }
  if (!op && row.label != null && String(row.label).trim() && !row.patch) {
    op = 'add_field';
  }

  if (op === 'add_field') {
    let fieldObj = row.field && typeof row.field === 'object' ? row.field : null;
    if (!fieldObj) {
      fieldObj = { ...row };
      for (const k of OP_KEYS.concat(['afterId', 'beforeId', 'patch', 'field', 'item', 'data', 'fields'])) {
        delete fieldObj[k];
      }
    }
    return { op: 'add_field', field: fieldObj, afterId: row.afterId };
  }
  if (op === 'update_field') {
    return { op: 'update_field', id: row.id, patch: row.patch };
  }
  if (op === 'remove_field') {
    return { op: 'remove_field', id: row.id };
  }
  if (!op) return null;
  return { ...row, op };
}

/**
 * O campo `description` no builder é «Instruções ao técnico». O LLM às vezes despeja
 * metaprompt / contexto de entrevista / placeholders — isso não deve ir para o app.
 * @param {string} raw
 * @returns {{ text: string, wasMeta: boolean }}
 */
function sanitizeCopilotFieldDescriptionForTechnician(raw) {
  const s = String(raw || '').trim();
  if (!s) return { text: '', wasMeta: false };
  const t = s.slice(0, MAX_FIELD_DESCRIPTION_CHARS);
  const low = t.toLowerCase();
  const wasMeta =
    /\[pergunta\s/i.test(t) ||
    /considere o contexto da entrevista/i.test(low) ||
    (/ao revisar o campo/i.test(low) && /(aderência|cenário)/i.test(t)) ||
    /^entrevista:\s*https?:\/\//i.test(t.trim());
  return { text: wasMeta ? '' : t, wasMeta };
}

/**
 * @param {object[]} schemaData
 * @param {{ operations?: object[] }} patch
 * @returns {{ schemaData: object[], warnings: string[] }}
 */
function applySchemaPatch(schemaData, patch) {
  const warnings = [];
  let strippedMetaDescriptions = 0;
  if (!Array.isArray(schemaData)) {
    warnings.push('schemaData inválido.');
    return { schemaData: [], warnings };
  }
  let data = schemaData.map((f) => (f && typeof f === 'object' ? { ...f } : null)).filter(Boolean);
  if (data.length > MAX_FIELDS) {
    warnings.push(`Schema com mais de ${MAX_FIELDS} campos — patch não aplicado.`);
    return { schemaData, warnings };
  }
  const ops = patch && Array.isArray(patch.operations) ? patch.operations : [];
  if (ops.length === 0) return { schemaData: data, warnings };
  if (ops.length > MAX_OPS) {
    warnings.push(`Mais de ${MAX_OPS} operações — só as primeiras ${MAX_OPS} foram aplicadas.`);
  }

  const usedIds = new Set();
  for (const f of data) {
    if (f.id) usedIds.add(String(f.id));
  }

  /**
   * `description` = instruções ao técnico no app; remover metaprompt do LLM.
   * @param {object} field
   */
  function finalizeDescriptionOnField(field) {
    if (!field || field.description == null) return;
    const raw = String(field.description);
    if (!raw.trim()) return;
    const { text, wasMeta } = sanitizeCopilotFieldDescriptionForTechnician(raw);
    if (wasMeta) strippedMetaDescriptions += 1;
    field.description = text;
  }

  /**
   * Atualiza propriedades escalares do campo sem mudar o tipo.
   * @param {object} cur
   * @param {object} p
   */
  function mergeFieldPatchScalars(cur, p) {
    if (!cur || !p || typeof p !== 'object') return;
    if (p.label != null) {
      const t = String(p.label).trim();
      if (t) cur.label = t.slice(0, 500);
    }
    if (p.required === true || p.required === false) cur.required = p.required;
    if (p.description != null) cur.description = String(p.description).trim();
    if (p.options != null) {
      if (Array.isArray(p.options)) {
        cur.options = p.options.map((o) => String(o).trim()).filter(Boolean).join(', ');
      } else {
        cur.options = String(p.options).trim();
      }
    }
    if (p.defaultValue != null) cur.defaultValue = String(p.defaultValue).trim();
    if (p.helpHtml != null) cur.helpHtml = String(p.helpHtml);
    if (p.contentHtml != null && cur.type === 'leitura') cur.contentHtml = String(p.contentHtml).slice(0, 500000);
    if (p.voiceTranscribeLanguage != null && cur.type === 'voice_note') {
      cur.voiceTranscribeLanguage = String(p.voiceTranscribeLanguage).trim().slice(0, 12);
    }
    if (p.showFieldInstructions === true || p.showFieldInstructions === false) {
      cur.showFieldInstructions = p.showFieldInstructions;
    }
    if (p.icon != null) cur.icon = String(p.icon).trim();
    if (p.iconLibrary != null) cur.iconLibrary = String(p.iconLibrary).trim() || 'Ionicons';
    if (p.iconColor != null) cur.iconColor = String(p.iconColor).trim();
    if (p.minItems != null) cur.minItems = String(p.minItems);
    if (p.maxItems != null) cur.maxItems = String(p.maxItems);
    if (p.multiple === true || p.multiple === false) cur.multiple = p.multiple;
    if (p.sectionFillMode != null) cur.sectionFillMode = String(p.sectionFillMode).trim();
    if (p.geofenceRadius != null) cur.geofenceRadius = String(p.geofenceRadius).trim();
    /* dependsOn* não é aplicado via Composer — visibilidade só por regras SHOW/HIDE (logicSuggestions). */
    if (p.requireOnlineValidation === true || p.requireOnlineValidation === false) {
      cur.requireOnlineValidation = p.requireOnlineValidation;
    }
    if (p.calcFormula != null) cur.calcFormula = String(p.calcFormula).trim();
    if (p.calcDisplayFormat != null && cur.type === 'calculated') {
      const v = String(p.calcDisplayFormat).trim().toLowerCase();
      if (['auto', 'number', 'currency', 'percent'].includes(v)) cur.calcDisplayFormat = v;
    }
    if (p.textMask != null) cur.textMask = String(p.textMask).trim();
    if (p.currencyCode != null && cur.type === 'currency') {
      cur.currencyCode = String(p.currencyCode).trim().slice(0, 12).toUpperCase();
    }
    if (p.allowTechnicianComment === true || p.allowTechnicianComment === false) {
      cur.allowTechnicianComment = p.allowTechnicianComment;
    }
    if (p.allowMediaDescription === true || p.allowMediaDescription === false) {
      cur.allowMediaDescription = p.allowMediaDescription;
    }
    if (p.facialAuthMode != null) cur.facialAuthMode = String(p.facialAuthMode).trim();
    if (cur.type === 'vision_checklist' || cur.type === 'vision_ai_analysis' || cur.type === 'vision_ai_comparison') {
      if (p.visionCaptureMode != null) {
        const m = String(p.visionCaptureMode).trim();
        if (m === 'photo_only' || m === 'video_only' || m === 'photo_and_video') {
          cur.visionCaptureMode = m;
        }
      }
      if (p.visionStructuredPrompt != null) {
        const s = String(p.visionStructuredPrompt).trim().slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
        cur.visionStructuredPrompt = s;
        if (s) cur.visionQuestions = [{ id: 'q1', text: s }];
      }
      if (p.visionQuestions != null && Array.isArray(p.visionQuestions)) {
        const rawItems = p.visionQuestions
          .map((x, i) => {
            if (!x || typeof x !== 'object') return null;
            const id = String(x.id || `q_${i + 1}`)
              .replace(/[^\w-]/g, '_')
              .slice(0, 64);
            const rawText = String(x.text || x.question || '').trim();
            if (!rawText) return null;
            return { id, text: rawText };
          })
          .filter(Boolean)
          .slice(0, MAX_VISION_SIMNAO_QUESTIONS);
        if (!rawItems.length) {
          /* mantém estado anterior */
        } else if (cur.type === 'vision_ai_analysis' || cur.type === 'vision_ai_comparison') {
          if (rawItems.length === 1) {
            const text = rawItems[0].text.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
            cur.visionQuestions = [{ id: rawItems[0].id || 'q1', text }];
            if (p.visionStructuredPrompt == null) {
              cur.visionStructuredPrompt = text;
            }
          } else {
            const merged = rawItems
              .map((q) => q.text)
              .join('\n\n')
              .slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
            cur.visionQuestions = [{ id: 'q1', text: merged }];
            cur.visionStructuredPrompt = merged;
          }
        } else {
          if (rawItems.length === 1) {
            const text = rawItems[0].text.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
            cur.visionQuestions = [{ id: rawItems[0].id || 'q1', text }];
            if (p.visionStructuredPrompt == null && text) {
              cur.visionStructuredPrompt = text;
            }
          } else {
            const merged = rawItems
              .map((q) => q.text)
              .join('\n\n')
              .slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
            cur.visionQuestions = [{ id: 'q1', text: merged }];
            cur.visionStructuredPrompt = merged;
          }
        }
      }
      if (
        (cur.type === 'vision_ai_analysis' || cur.type === 'vision_ai_comparison') &&
        p.visionAnalysisGrid != null
      ) {
        const g = String(p.visionAnalysisGrid)
          .trim()
          .toLowerCase()
          .replace(/\*/g, 'x');
        if (g === '1x1' || g === '2x2') {
          cur.visionAnalysisGrid = g;
        }
      }
      if (cur.type === 'vision_ai_comparison' && p.visionComparisonReferenceDataUrl != null) {
        const s = String(p.visionComparisonReferenceDataUrl).trim();
        cur.visionComparisonReferenceDataUrl =
          s.startsWith('data:image/') && s.length <= 9 * 1024 * 1024 ? s : '';
      }
      if (
        cur.type === 'vision_ai_analysis' &&
        (p.visionRating0To10Enabled === true || p.visionRating0To10Enabled === false)
      ) {
        cur.visionRating0To10Enabled = !!p.visionRating0To10Enabled;
      }
      if (
        (cur.type === 'vision_ai_analysis' || cur.type === 'vision_ai_comparison') &&
        (p.visionShowAiResponseInForm === true || p.visionShowAiResponseInForm === false)
      ) {
        cur.visionShowAiResponseInForm = !!p.visionShowAiResponseInForm;
      }
    }
    if (cur.type === 'image_annotation') {
      if (p.annotationPenColor != null) {
        cur.annotationPenColor = String(p.annotationPenColor).trim().slice(0, 20);
      }
      if (p.annotationStrokeWidth != null) {
        const sw = parseInt(String(p.annotationStrokeWidth), 10);
        if (Number.isFinite(sw) && sw >= 1 && sw <= 24) cur.annotationStrokeWidth = sw;
      }
    }
    if (cur.type === 'lookup_select') {
      if (p.lookupSource != null) {
        const s = String(p.lookupSource).trim();
        if (s === 'preset' || s === 'inline_json' || s === 'api') cur.lookupSource = s;
      }
      if (p.lookupPreset != null) cur.lookupPreset = String(p.lookupPreset).trim().slice(0, 80);
      if (p.lookupInlineJson != null) cur.lookupInlineJson = String(p.lookupInlineJson).slice(0, 120000);
      if (p.lookupApiPath != null) {
        const rawPath = String(p.lookupApiPath).trim().slice(0, 240);
        cur.lookupApiPath = rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '';
      }
    }
    if (cur.type === 'repeatable_matrix') {
      if (p.matrixColumns != null && Array.isArray(p.matrixColumns)) {
        const mc = p.matrixColumns
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
        if (mc.length) cur.matrixColumns = mc;
      }
      if (p.matrixMinRows != null) cur.matrixMinRows = String(p.matrixMinRows).trim().slice(0, 8);
      if (p.matrixMaxRows != null) cur.matrixMaxRows = String(p.matrixMaxRows).trim().slice(0, 8);
    }
    if (cur.type === 'opinion_scale') {
      if (p.opinionScaleMode != null) {
        const m = String(p.opinionScaleMode).trim();
        if (m === 'nps' || m === 'likert') cur.opinionScaleMode = m;
      }
      if (p.likertLabels != null) cur.likertLabels = String(p.likertLabels).slice(0, 2000);
    }
    finalizeDescriptionOnField(cur);
  }

  const expandedOps = expandCopilotSchemaOperations(ops);
  const slice = expandedOps.slice(0, MAX_OPS);
  for (const rawIn of slice) {
    if (!rawIn || typeof rawIn !== 'object') continue;
    const raw = normalizeCopilotSchemaPatchOperationRow(rawIn);
    if (!raw || typeof raw !== 'object') {
      warnings.push('Operação de schemaPatch ignorada (sem `op` reconhecível — use add_field, update_field ou remove_field).');
      continue;
    }
    const op = String(raw.op || '').toLowerCase();
    if (op === 'add_field') {
      const fieldRaw = raw.field && typeof raw.field === 'object' ? raw.field : null;
      if (!fieldRaw) {
        warnings.push('add_field sem objeto field — ignorado.');
        continue;
      }
      const n = normalizeSchemaItem(fieldRaw, usedIds);
      if (!n) continue;
      finalizeDescriptionOnField(n);
      const afterId = raw.afterId != null ? String(raw.afterId).trim() : '';
      if (!afterId) {
        data.push(n);
      } else {
        const idx = data.findIndex((x) => x.id === afterId);
        if (idx < 0) {
          data.push(n);
          warnings.push(`add_field: afterId "${afterId}" não encontrado — campo acrescentado ao fim.`);
        } else {
          data.splice(idx + 1, 0, n);
        }
      }
    } else if (op === 'update_field') {
      const id = raw.id != null ? String(raw.id).trim() : '';
      const p = raw.patch && typeof raw.patch === 'object' ? raw.patch : null;
      if (!id || !p) {
        warnings.push('update_field inválido — ignorado.');
        continue;
      }
      const idx = data.findIndex((x) => x.id === id);
      if (idx < 0) {
        warnings.push(`update_field: id "${id}" não encontrado.`);
        continue;
      }
      const cur = { ...data[idx] };
      if (p.type != null) {
        const tmpIds = new Set(usedIds);
        tmpIds.delete(cur.id);
        const merged = normalizeSchemaItem(
          {
            ...cur,
            id: cur.id,
            type: p.type,
            options: p.options != null ? p.options : cur.options,
            label: p.label != null ? p.label : cur.label,
            required: p.required != null ? p.required : cur.required,
            description: p.description != null ? p.description : cur.description,
            icon: p.icon != null ? p.icon : cur.icon,
            iconLibrary: p.iconLibrary != null ? p.iconLibrary : cur.iconLibrary,
            iconColor: p.iconColor != null ? p.iconColor : cur.iconColor,
          },
          tmpIds
        );
        if (merged) {
          merged.id = cur.id;
          usedIds.add(cur.id);
          mergeFieldPatchScalars(merged, p);
          data[idx] = merged;
        }
      } else {
        mergeFieldPatchScalars(cur, p);
        data[idx] = cur;
      }
    } else if (op === 'remove_field') {
      const id = raw.id != null ? String(raw.id).trim() : '';
      if (!id) continue;
      const prevLen = data.length;
      data = data.filter((x) => x.id !== id);
      if (data.length === prevLen) warnings.push(`remove_field: id "${id}" não encontrado.`);
    } else {
      warnings.push(`Operação desconhecida: ${op}`);
    }
    if (data.length > MAX_FIELDS) {
      warnings.push(`Limite de ${MAX_FIELDS} campos excedido após patch — truncado.`);
      data = data.slice(0, MAX_FIELDS);
      break;
    }
  }

  if (strippedMetaDescriptions > 0) {
    warnings.push(
      'Uma ou mais «instruções ao técnico» (campo description) foram limpas por conterem metatexto do Composer (entrevista, URLs ou instruções ao modelo). Use o chat para esse contexto, não o campo do técnico.'
    );
  }

  return { schemaData: data, warnings };
}

module.exports = {
  applySchemaPatch,
  sanitizeCopilotFieldDescriptionForTechnician,
  MAX_OPS,
  MAX_FIELDS,
};
