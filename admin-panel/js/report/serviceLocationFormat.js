/**
 * Texto de «local de atendimento» a partir do despacho (endereço + lat/lng).
 * Não confundir com o título da OS / nome do formulário.
 */

function pickAddress(t) {
  if (!t || typeof t !== 'object') return '';
  const a =
    t.locationAddress != null && String(t.locationAddress).trim() !== ''
      ? String(t.locationAddress).trim()
      : t.metadata &&
          t.metadata.locationAddress != null &&
          String(t.metadata.locationAddress).trim() !== ''
        ? String(t.metadata.locationAddress).trim()
        : '';
  return a;
}

function pickCoords(t) {
  if (!t || typeof t !== 'object') return { hasBoth: false, lat: NaN, lng: NaN };
  let lat = t.locationLat;
  let lng = t.locationLng;
  if (lat != null && lat !== '') lat = parseFloat(lat);
  else lat = NaN;
  if (lng != null && lng !== '') lng = parseFloat(lng);
  else lng = NaN;
  return {
    hasBoth: Number.isFinite(lat) && Number.isFinite(lng),
    lat,
    lng,
  };
}

/**
 * Uma linha para cartões (Kanban): endereço e coordenadas; vazio se não houver dados.
 */
export function formatServiceLocationPlainLine(t) {
  const addr = pickAddress(t);
  const { hasBoth, lat, lng } = pickCoords(t);
  const parts = [];
  if (addr) parts.push(addr);
  if (hasBoth) parts.push(`Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`);
  else if (Number.isFinite(lat)) parts.push(`Lat ${lat.toFixed(6)}`);
  else if (Number.isFinite(lng)) parts.push(`Lng ${lng.toFixed(6)}`);
  return parts.join(' · ');
}

/**
 * Fragmento HTML (conteúdo já escapado onde necessário) para relatórios/PDF.
 * @param {object} t
 * @param {(s: unknown) => string} esc - função que escapa texto para HTML
 */
export function formatServiceLocationInnerHtml(t, esc) {
  const escFn =
    esc ||
    ((s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;'));
  const addr = pickAddress(t);
  const { hasBoth, lat, lng } = pickCoords(t);
  const parts = [];
  if (addr) {
    parts.push(`<div style="line-height:1.35">${escFn(addr)}</div>`);
  }
  if (hasBoth) {
    parts.push(
      `<div style="font-size:10px;color:#64748b;margin-top:4px;font-family:ui-monospace,monospace;font-weight:600">Lat: ${lat.toFixed(6)} · Lng: ${lng.toFixed(6)}</div>`
    );
  } else if (Number.isFinite(lat) || Number.isFinite(lng)) {
    const bits = [];
    if (Number.isFinite(lat)) bits.push(`Lat: ${lat.toFixed(6)}`);
    if (Number.isFinite(lng)) bits.push(`Lng: ${lng.toFixed(6)}`);
    parts.push(
      `<div style="font-size:10px;color:#64748b;margin-top:4px;font-family:ui-monospace,monospace;font-weight:600">${bits.join(' · ')}</div>`
    );
  }
  if (parts.length === 0) {
    return `<span style="color:#94a3b8;font-weight:500;font-style:italic">Não informado no despacho</span>`;
  }
  return parts.join('');
}
