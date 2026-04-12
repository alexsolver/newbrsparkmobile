'use strict';

/**
 * Evidências de sessão que não devem ser reaproveitadas numa nova visita de revisão
 * (novo deslocamento, nova assinatura, etc.). Alinhado ao app e ao Form Builder.
 */
const REVISION_SESSION_FIELD_TYPES = new Set([
  'signature',
  'signature_summary',
  'transit_start',
  'transit_end',
  'geofence_check',
  'facial_recognition',
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

/**
 * Remove assinatura, deslocamento, geofence, reconhecimento facial, etc. do mapa de respostas.
 * Muta `out` (objeto plano).
 */
function stripRevisionSessionEvidenceInPlace(out, templateSchemaData) {
  if (!out || typeof out !== 'object' || Array.isArray(out)) return out;
  const schema = parseTemplateSchemaArray(templateSchemaData);
  for (const f of schema) {
    if (!f || !f.id) continue;
    if (REVISION_SESSION_FIELD_TYPES.has(effectiveFormFieldType(f))) {
      delete out[f.id];
    }
  }
  return out;
}

module.exports = {
  REVISION_SESSION_FIELD_TYPES,
  parseTemplateSchemaArray,
  effectiveFormFieldType,
  stripRevisionSessionEvidenceInPlace,
};
