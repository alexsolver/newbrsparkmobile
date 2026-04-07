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
          warnings.push(`add_field: afterId «${afterId}» não encontrado — campo acrescentado ao fim.`);
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
        warnings.push(`update_field: id «${id}» não encontrado.`);
        continue;
      }
      const cur = { ...data[idx] };
      if (p.label != null) cur.label = String(p.label).trim() || cur.label;
      if (p.required === true || p.required === false) cur.required = p.required;
      if (p.description != null) cur.description = String(p.description).trim();
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
          },
          tmpIds
        );
        if (merged) {
          merged.id = cur.id;
          usedIds.add(cur.id);
          data[idx] = merged;
        }
      } else {
        if (p.options != null) {
          if (Array.isArray(p.options)) {
            cur.options = p.options.map((o) => String(o).trim()).filter(Boolean).join(', ');
          } else {
            cur.options = String(p.options).trim();
          }
        }
        data[idx] = cur;
      }
    } else if (op === 'remove_field') {
      const id = raw.id != null ? String(raw.id).trim() : '';
      if (!id) continue;
      const prevLen = data.length;
      data = data.filter((x) => x.id !== id);
      if (data.length === prevLen) warnings.push(`remove_field: id «${id}» não encontrado.`);
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
