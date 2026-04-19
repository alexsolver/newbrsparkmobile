'use strict';

/**
 * Só o que a operação "devolver à campo" deve anular: novo deslocamento e nova assinatura.
 * Os restantes preenchimentos (fotos, geocerca, mídias, etc.) mantêm-se.
 */
const REVISION_SESSION_FIELD_TYPES = new Set([
  'signature',
  'signature_summary',
  'transit_start',
  'transit_end',
]);

function normalizeFormFieldType(t) {
  const s = String(t == null ? '' : t).trim().replace(/[\s-]+/g, '_');
  return s ? s.toLowerCase() : '';
}

function effectiveFormFieldType(field) {
  if (!field || typeof field !== 'object') return '';
  const raw = field.type ?? field.fieldType ?? field.kind ?? field.component ?? field.controlType;
  return normalizeFormFieldType(raw);
}

function parseTemplateSchemaArray(schemaData) {
  if (Array.isArray(schemaData)) return schemaData;
  if (typeof schemaData === 'string') {
    try {
      const p = JSON.parse(schemaData);
      if (Array.isArray(p)) return p;
      if (p && typeof p === 'object' && Array.isArray(p.schema)) return p.schema;
      if (p && typeof p === 'object' && Array.isArray(p.fields)) return p.fields;
      if (p && typeof p === 'object' && Array.isArray(p.blocks)) return p.blocks;
      if (p && typeof p === 'object' && p.form && Array.isArray(p.form.fields)) return p.form.fields;
    } catch (e) {
      return [];
    }
    return [];
  }
  if (schemaData && typeof schemaData === 'object') {
    if (Array.isArray(schemaData.schema)) return schemaData.schema;
    if (Array.isArray(schemaData.fields)) return schemaData.fields;
    if (Array.isArray(schemaData.blocks)) return schemaData.blocks;
    if (schemaData.form && Array.isArray(schemaData.form.fields)) return schemaData.form.fields;
  }
  return [];
}

function mergeTemplateSchemaForStrip(template) {
  if (!template || typeof template !== 'object') return [];
  const seen = new Map();
  for (const f of parseTemplateSchemaArray(template.schemaData)) {
    if (f && f.id) seen.set(String(f.id), f);
  }
  if (Array.isArray(template.fields)) {
    for (const f of template.fields) {
      if (f && f.id) seen.set(String(f.id), f);
    }
  }
  return [...seen.values()];
}

function resolveSchemaFields(templateOrSchema) {
  if (templateOrSchema == null) return [];
  if (typeof templateOrSchema === 'object' && !Array.isArray(templateOrSchema)) {
    if (templateOrSchema.schemaData != null || Array.isArray(templateOrSchema.fields)) {
      return mergeTemplateSchemaForStrip(templateOrSchema);
    }
  }
  return parseTemplateSchemaArray(templateOrSchema);
}

function coerceTransitEvidenceObject(raw) {
  if (raw == null) return null;
  let cur = raw;
  for (let d = 0; d < 5; d++) {
    if (typeof cur === 'string') {
      const t = cur.trim();
      if (!t) return null;
      try {
        cur = JSON.parse(t);
      } catch {
        return null;
      }
      continue;
    }
    break;
  }
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null;
  return cur;
}

function looksLikeTransitDisplacementJson(raw) {
  const o = coerceTransitEvidenceObject(raw);
  if (!o) return false;
  const act = String(o.action || '').toUpperCase();
  return act === 'SAIDA' || act === 'CHEGADA';
}

function looksLikeSignatureValue(raw) {
  if (raw == null) return false;
  if (typeof raw === 'string') return raw.trim().startsWith('SIG_V1|');
  return false;
}

/**
 * Chaves órfãs ou duplicadas: JSON de deslocamento (SAIDA/CHEGADA) e assinatura SIG_V1,
 * mesmo quando o id não veio do schema ou o valor está noutra chave.
 */
function stripOrphanTransitAndSignatureInPlace(out) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return;
  for (const k of Object.keys(out)) {
    if (k.startsWith('__section_repeat_') && Array.isArray(out[k])) {
      for (const row of out[k]) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        for (const ck of Object.keys(row)) {
          const v = row[ck];
          if (looksLikeTransitDisplacementJson(v) || looksLikeSignatureValue(v)) delete row[ck];
        }
      }
      continue;
    }
    if (k.startsWith('__')) continue;
    const v = out[k];
    if (looksLikeTransitDisplacementJson(v) || looksLikeSignatureValue(v)) delete out[k];
  }
}

/**
 * Remove só assinatura e início/fim de deslocamento (raiz + linhas `__section_repeat_*`).
 * `templateOrSchema`: objeto template (`schemaData` / `fields`) ou array schema legado.
 * Muta `out` (objeto plano).
 */
function stripRevisionSessionEvidenceInPlace(out, templateOrSchema) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return out;
  const schema = resolveSchemaFields(templateOrSchema);
  const toStrip = new Set();
  for (const f of schema) {
    if (!f || !f.id) continue;
    if (REVISION_SESSION_FIELD_TYPES.has(effectiveFormFieldType(f))) toStrip.add(String(f.id));
  }
  for (const fid of toStrip) {
    if (out[fid] != null) delete out[fid];
  }
  for (const k of Object.keys(out)) {
    if (!k.startsWith('__section_repeat_') || !Array.isArray(out[k])) continue;
    for (const row of out[k]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      for (const fid of toStrip) {
        if (row[fid] != null) delete row[fid];
      }
    }
  }
  stripOrphanTransitAndSignatureInPlace(out);
  return out;
}

module.exports = {
  REVISION_SESSION_FIELD_TYPES,
  parseTemplateSchemaArray,
  effectiveFormFieldType,
  stripRevisionSessionEvidenceInPlace,
};
