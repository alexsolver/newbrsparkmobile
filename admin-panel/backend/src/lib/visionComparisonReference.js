'use strict';

const MAX_REFERENCE_BYTES = 6 * 1024 * 1024;

/**
 * Extrai buffer + mime de `visionComparisonReferenceDataUrl` (data URL) no schema do campo.
 * @param {unknown} field
 * @returns {{ buffer: Buffer, mimetype: string } | null}
 */
function parseVisionComparisonReferenceFromField(field) {
  const dataUrl = String(field?.visionComparisonReferenceDataUrl ?? field?.vision_comparison_reference_data_url ?? '')
    .trim();
  if (!dataUrl.startsWith('data:')) return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 8) return null;
  const header = dataUrl.slice(5, comma);
  const b64 = dataUrl.slice(comma + 1).trim();
  let mime = 'image/jpeg';
  const semi = header.indexOf(';');
  if (semi > 0) {
    mime = header.slice(0, semi).trim().toLowerCase() || mime;
  } else {
    mime = header.trim().toLowerCase() || mime;
  }
  if (!mime.startsWith('image/')) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 32 || buf.length > MAX_REFERENCE_BYTES) return null;
    return { buffer: buf, mimetype: mime };
  } catch {
    return null;
  }
}

module.exports = {
  parseVisionComparisonReferenceFromField,
  MAX_REFERENCE_BYTES,
};
