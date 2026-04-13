'use strict';

/**
 * Normaliza opções vindas do painel (JSON em multipart ou body) para o LLM.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseFormContextFromOptions(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const str = (k, max) => (typeof o[k] === 'string' ? String(o[k]).trim().slice(0, max) : '');
  let focusedCanvasField = null;
  const fc = o.focusedCanvasField;
  if (fc && typeof fc === 'object' && !Array.isArray(fc)) {
    const id = typeof fc.id === 'string' ? fc.id.trim().slice(0, 96) : fc.id != null ? String(fc.id).trim().slice(0, 96) : '';
    const label = typeof fc.label === 'string' ? fc.label.trim().slice(0, 240) : '';
    const type = typeof fc.type === 'string' ? fc.type.trim().slice(0, 72) : '';
    if (id || label) {
      const icon = typeof fc.icon === 'string' ? fc.icon.trim().slice(0, 120) : '';
      const iconLibrary =
        typeof fc.iconLibrary === 'string' ? fc.iconLibrary.trim().slice(0, 40) : '';
      focusedCanvasField = { id, label, type, icon, iconLibrary };
    }
  }
  return {
    objective: str('objective', 800),
    sector: str('sector', 200),
    formKind: str('formKind', 80),
    requireStampedPhotos: o.requireStampedPhotos === true || o.requireStampedPhotos === 'true',
    allowBarcode: o.allowBarcode === true || o.allowBarcode === 'true',
    requireGps: o.requireGps === true || o.requireGps === 'true',
    allowGeofence: o.allowGeofence === true || o.allowGeofence === 'true',
    allowTransit: o.allowTransit === true || o.allowTransit === 'true',
    allowFacial: o.allowFacial === true || o.allowFacial === 'true',
    allowVisionChecklist: o.allowVisionChecklist === true || o.allowVisionChecklist === 'true',
    allowSignature: o.allowSignature === true || o.allowSignature === 'true',
    allowCalculated: o.allowCalculated === true || o.allowCalculated === 'true',
    focusedCanvasField,
  };
}

module.exports = {
  parseFormContextFromOptions,
};
