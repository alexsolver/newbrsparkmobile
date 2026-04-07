'use strict';

/**
 * Normaliza opções vindas do painel (JSON em multipart ou body) para o LLM.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseFormContextFromOptions(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const str = (k, max) => (typeof o[k] === 'string' ? String(o[k]).trim().slice(0, max) : '');
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
    allowSignature: o.allowSignature === true || o.allowSignature === 'true',
    allowCalculated: o.allowCalculated === true || o.allowCalculated === 'true',
  };
}

module.exports = {
  parseFormContextFromOptions,
};
