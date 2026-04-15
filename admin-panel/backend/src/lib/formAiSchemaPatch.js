'use strict';

const {
  MAX_VISION_SIMNAO_QUESTIONS,
  MAX_VISION_STRUCTURED_PROMPT_CHARS,
  MAX_VISION_MULTI_SIMNAO_TEXT_CHARS,
} = require('../constants/visionSimNaoQuestions');
const { normalizeSchemaItem } = require('./formAiNormalize');

const MAX_OPS = 30;
const MAX_FIELDS = 250;

/**
 * @param {object[]} schemaData
 * @param {{ operations?: object[] }} patch
 * @returns {{ schemaData: object[], warnings: string[] }}
 */
function applySchemaPatch(schemaData, patch) {
  const warnings = [];
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
    if (p.dependsOnId != null) cur.dependsOnId = String(p.dependsOnId).trim();
    if (p.dependsOnOperator != null) cur.dependsOnOperator = String(p.dependsOnOperator).trim();
    if (p.dependsOnValue != null) cur.dependsOnValue = String(p.dependsOnValue);
    if (p.requireOnlineValidation === true || p.requireOnlineValidation === false) {
      cur.requireOnlineValidation = p.requireOnlineValidation;
    }
    if (p.calcFormula != null) cur.calcFormula = String(p.calcFormula).trim();
    if (p.textMask != null) cur.textMask = String(p.textMask).trim();
    if (p.allowTechnicianComment === true || p.allowTechnicianComment === false) {
      cur.allowTechnicianComment = p.allowTechnicianComment;
    }
    if (p.allowMediaDescription === true || p.allowMediaDescription === false) {
      cur.allowMediaDescription = p.allowMediaDescription;
    }
    if (p.facialAuthMode != null) cur.facialAuthMode = String(p.facialAuthMode).trim();
    if (cur.type === 'vision_checklist' || cur.type === 'vision_ai_analysis') {
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
        } else if (cur.type === 'vision_ai_analysis') {
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
        } else if (rawItems.length >= 2) {
          cur.visionQuestions = rawItems.map((q, i) => ({
            id: q.id || `q${i + 1}`,
            text: q.text.slice(0, MAX_VISION_MULTI_SIMNAO_TEXT_CHARS),
          }));
          cur.visionStructuredPrompt = '';
        } else {
          const text = rawItems[0].text.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
          cur.visionQuestions = [{ id: rawItems[0].id || 'q1', text }];
          if (p.visionStructuredPrompt == null && text) {
            cur.visionStructuredPrompt = text;
          }
        }
      }
      if (cur.type === 'vision_ai_analysis' && p.visionAnalysisGrid != null) {
        const g = String(p.visionAnalysisGrid)
          .trim()
          .toLowerCase()
          .replace(/\*/g, 'x');
        if (g === '1x1' || g === '2x2') {
          cur.visionAnalysisGrid = g;
        }
      }
      if (
        cur.type === 'vision_ai_analysis' &&
        (p.visionRating0To10Enabled === true || p.visionRating0To10Enabled === false)
      ) {
        cur.visionRating0To10Enabled = !!p.visionRating0To10Enabled;
      }
      if (
        cur.type === 'vision_ai_analysis' &&
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
        if (s === 'preset' || s === 'inline_json') cur.lookupSource = s;
      }
      if (p.lookupPreset != null) cur.lookupPreset = String(p.lookupPreset).trim().slice(0, 80);
      if (p.lookupInlineJson != null) cur.lookupInlineJson = String(p.lookupInlineJson).slice(0, 120000);
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
  }

  const slice = ops.slice(0, MAX_OPS);
  for (const raw of slice) {
    if (!raw || typeof raw !== 'object') continue;
    const op = String(raw.op || '').toLowerCase();
    if (op === 'add_field') {
      const fieldRaw = raw.field && typeof raw.field === 'object' ? raw.field : null;
      if (!fieldRaw) {
        warnings.push('add_field sem objeto field — ignorado.');
        continue;
      }
      const n = normalizeSchemaItem(fieldRaw, usedIds);
      if (!n) continue;
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

  return { schemaData: data, warnings };
}

module.exports = {
  applySchemaPatch,
  MAX_OPS,
  MAX_FIELDS,
};
