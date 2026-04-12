'use strict';

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
