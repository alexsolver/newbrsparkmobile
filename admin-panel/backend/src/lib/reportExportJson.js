'use strict';

const { mergePresetConfig, isFieldVisible } = require('./reportPresetDefaults');

function hasResponseValue(v) {
  if (v === undefined || v === null) return false;
  if (v === '') return false;
  if (Array.isArray(v)) return v.some((x) => x !== undefined && x !== null && String(x).trim() !== '');
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

/**
 * @param {object} task - painel task (mapExecutionToPanelTask)
 * @param {object} mergedConfig - mergePresetConfig(...)
 */
function buildFilteredExportPayload(task, mergedConfig) {
  const m = mergedConfig.modules || {};
  const hideEmpty = !!mergedConfig.hideEmptyFields;
  const responses = task.responses && typeof task.responses === 'object' ? task.responses : {};
  const fields = Array.isArray(task.template?.fields) ? task.template.fields : [];

  const formFieldEntries = [];
  for (const f of fields) {
    if (!f || !f.id) continue;
    if (!isFieldVisible(mergedConfig, f.id)) continue;
    const val = responses[f.id];
    if (hideEmpty && !hasResponseValue(val)) continue;
    formFieldEntries.push({
      fieldId: f.id,
      label: f.label || f.id,
      type: f.type || null,
      value: val === undefined ? null : val,
    });
  }

  const photos = [];
  for (const f of fields) {
    if (!f || !f.id) continue;
    const t = f.type;
    if (t !== 'photo' && t !== 'photo_stamped' && t !== 'facial_recognition') continue;
    if (!isFieldVisible(mergedConfig, f.id)) continue;
    const val = responses[f.id];
    const urls = Array.isArray(val) ? val : val != null ? [val] : [];
    const httpUrls = urls.filter((u) => typeof u === 'string' && (u.startsWith('http') || u.startsWith('data:image')));
    if (httpUrls.length === 0 && hideEmpty) continue;
    photos.push({ fieldId: f.id, label: f.label || f.id, urls: httpUrls });
  }

  const execution = {
    id: task.id,
    osNumber: task.osNumber,
    status: task.status,
    ownerEmail: task.ownerEmail,
    title: task.title,
    description: task.description,
    refId: task.refId,
    lastSubmittedRevision: task.lastSubmittedRevision,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    syncedAt: task.syncedAt,
    etaMinutes: task.etaMinutes,
  };

  if (m.technicalBlock !== false) {
    execution.metadata = task.metadata;
    execution.gpsLocation = task.gpsLocation;
    execution.locationAddress = task.locationAddress;
    execution.locationLat = task.locationLat;
    execution.locationLng = task.locationLng;
    execution.locationRadius = task.locationRadius;
    execution.locationZoneType = task.locationZoneType;
    execution.locationPolygon = task.locationPolygon;
  }

  if (m.productivity !== false || m.transit !== false) {
    execution.businessMetrics = task.businessMetrics ?? null;
  }

  const out = {
    exportSchemaVersion: 1,
    generatedAt: new Date().toISOString(),
    modulesIncluded: { ...m },
    branding: {
      logoUrl: mergedConfig.logoUrl || null,
      reportTitle: mergedConfig.reportTitle || null,
      reportSubtitle: mergedConfig.reportSubtitle || null,
    },
    execution,
    template: task.template
      ? {
          id: task.template.id,
          title: task.template.title,
          sectionBreaks: m.formResponses !== false ? task.template.sectionBreaks : undefined,
        }
      : null,
    formFields: m.formResponses !== false ? formFieldEntries : [],
    photos: m.photoGallery !== false ? photos : [],
  };

  if (m.timeline !== false) {
    out.timeline = {
      createdAt: task.createdAt,
      syncedAt: task.syncedAt,
      receivedAt: task.metadata?.receivedAt ?? null,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  }

  if (m.transit !== false) {
    const transitData = Object.create(null);
    for (const f of fields) {
      if (!f || !f.id) continue;
      if (f.type !== 'transit_start' && f.type !== 'transit_end') continue;
      if (!isFieldVisible(mergedConfig, f.id)) continue;
      transitData[f.id] = responses[f.id] !== undefined ? responses[f.id] : null;
    }
    out.transitFieldData = transitData;
  }

  return out;
}

module.exports = {
  buildFilteredExportPayload,
  mergePresetConfig,
};
