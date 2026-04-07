'use strict';

const {
  parseTemplateSchemaArray,
  effectiveFormFieldType,
} = require('./revisionSessionFields');

/** @param {object|null|undefined} field */
function resolveSectionBreakLabel(field) {
  if (!field || typeof field !== 'object') return '';
  const meta = field.metadata && typeof field.metadata === 'object' ? field.metadata : null;
  const props = field.properties && typeof field.properties === 'object' ? field.properties : null;
  const cfg = field.config && typeof field.config === 'object' ? field.config : null;
  const candidates = [
    field.label,
    field.title,
    field.name,
    field.text,
    field.sectionTitle,
    field.question,
    field.placeholder,
    field.caption,
    field.displayName,
    field.rotulo,
    field.nome,
    meta && meta.label,
    meta && meta.title,
    meta && meta.name,
    meta && meta.sectionTitle,
    props && props.label,
    props && props.title,
    cfg && cfg.label,
    cfg && cfg.title,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return '';
}

function buildRepeatFieldMap(schemaArray) {
  const out = Object.create(null);
  if (!Array.isArray(schemaArray)) return out;
  let repeatSid = null;
  for (const f of schemaArray) {
    if (!f || !f.id) continue;
    const nt = effectiveFormFieldType(f);
    if (nt === 'section_break') {
      repeatSid = f.multiple ? String(f.id) : null;
      continue;
    }
    if (nt === 'hidden') continue;
    if (repeatSid) out[String(f.id)] = repeatSid;
  }
  return out;
}

/**
 * Mapeia uma linha Prisma ChecklistExecution (+ template + revisions parciais) para o objeto «task» do painel.
 * @param {object} ex - execution com template e opcionalmente revisions
 * @param {{ ownerAvatar?: string|null, includeSchemaRaw?: boolean, lastSubmittedRevision?: number }} opts
 */
function mapExecutionToPanelTask(ex, opts = {}) {
  const ownerAvatar = opts.ownerAvatar != null ? opts.ownerAvatar : null;
  const includeSchemaRaw = !!opts.includeSchemaRaw;
  let meta = ex.metadata || {};
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch (e) {
      meta = {};
    }
  }

  const schemaArray = parseTemplateSchemaArray(ex.template?.schemaData);
  const lsr =
    opts.lastSubmittedRevision != null
      ? opts.lastSubmittedRevision
      : ex.lastSubmittedRevision;

  return {
    id: ex.id,
    osNumber: ex.osNumber || null,
    lastSubmittedRevision: lsr,
    refId: meta.refId || ex.templateId || null,
    ownerEmail: ex.ownerEmail,
    ownerAvatar,
    status: ex.status,
    title: meta.title || ex.template?.title || 'OS sem título',
    description: meta.description || ex.template?.description || '',
    metadata: meta,
    responses: ex.responses,
    gpsLocation: ex.gpsLocation,
    locationLat: ex.locationLat,
    locationLng: ex.locationLng,
    locationRadius: ex.locationRadius,
    locationAddress: ex.locationAddress,
    locationZoneType: ex.locationZoneType,
    locationPolygon: ex.locationPolygon,
    createdAt: ex.createdAt,
    startedAt: ex.startedAt,
    completedAt: ex.completedAt,
    syncedAt: ex.syncedAt,
    etaMinutes: ex.etaMinutes,
    businessMetrics: ex.businessMetrics ?? null,
    trackingGpsAgeSeconds: opts.trackingGpsAgeSeconds ?? null,
    trackingSignalLost: opts.trackingSignalLost ?? false,
    template: ex.template
      ? {
          id: ex.template.id,
          title: ex.template.title,
          fields: schemaArray
            .filter((f) => {
              const nt = effectiveFormFieldType(f);
              return f && f.id && nt !== 'section_break' && nt !== 'hidden';
            })
            .map((f) => ({
              id: f.id,
              label: f.label || f.id,
              type: f.type,
              allowTechnicianComment: !!f.allowTechnicianComment,
            })),
          sectionBreaks: schemaArray
            .filter((f) => f && f.id && effectiveFormFieldType(f) === 'section_break')
            .map((f) => {
              const human = resolveSectionBreakLabel(f);
              const rawLab = f.label != null ? String(f.label).trim() : '';
              return {
                id: f.id,
                label: human || rawLab || f.id,
                type: 'section_break',
                multiple: !!f.multiple,
              };
            }),
          repeatFieldMap: buildRepeatFieldMap(schemaArray),
          ...(includeSchemaRaw ? { schemaData: ex.template.schemaData } : {}),
        }
      : null,
  };
}

module.exports = {
  mapExecutionToPanelTask,
  resolveSectionBreakLabel,
  buildRepeatFieldMap,
};
