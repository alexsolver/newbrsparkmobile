/**
 * Pré-visualização WYSIWYG do PDF — estrutura alinhada ao print da Central de Operações.
 */

import {
  isFieldVisible,
  fieldLabelOverride,
  normalizeModuleOrder,
} from './reportPresetBrowser.js';
import { mergeTheme } from './reportThemeBrowser.js';
import {
  extractTransitEndpointsForReport,
  computeTransitSecondsFromEndpoints,
  buildTransitDisplayMetrics,
  fmtDurationPtBr,
  resolveProductivityFromTask,
  transitPctDeltaVsPlanned,
} from './previewExecutionMetrics.js';
import {
  collectSectionTimingRowsForPreview,
  buildPauseProductivityPdfFragment,
} from './pdfStandardBlocks.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;');

/** Campos de exemplo no construtor (rótulos editáveis / visibilidade) */
export const MOCK_PREVIEW_SCHEMA = [
  { id: 'q_cliente', label: 'Nome do cliente', type: 'text' },
  { id: 'q_servico', label: 'Tipo de serviço', type: 'dropdown' },
  { id: 'q_ok', label: 'Serviço concluído com sucesso', type: 'boolean' },
  { id: 'q_obs', label: 'Observações', type: 'text' },
  { id: 'q_vazio', label: 'Campo opcional (vazio no exemplo)', type: 'text' },
  { id: 'ph_antes', label: 'Foto antes', type: 'photo' },
];

/** Dados de exemplo para o canvas */
export const MOCK_PREVIEW_TASK = {
  id: 'clxxxxxxxx_preview',
  osNumber: 'FT-2026-04-0000999',
  status: 'SYNCED',
  ownerEmail: 'tecnico.exemplo@empresa.com',
  ownerAvatar: null,
  title: 'Torre 5 — Manutenção preventiva',
  description: 'Verificação trimestral de equipamentos.',
  refId: 'CRM-88421',
  lastSubmittedRevision: 1,
  metadata: {
    priority: 'Normal',
    devicePlatform: 'iOS',
    receivedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    acceptedAt: new Date(Date.now() - 86400000 * 2 + 3600000).toISOString(),
  },
  createdAt: new Date(Date.now() - 86400000 * 3),
  startedAt: new Date(Date.now() - 86400000 * 2 + 7200000),
  completedAt: new Date(Date.now() - 3600000),
  syncedAt: new Date(Date.now() - 1800000),
  locationZoneType: 'point',
  locationAddress: 'Av. Paulista, 1000 — São Paulo',
  template: { title: 'Checklist manutenção predial' },
  responses: {
    q_cliente: 'Condomínio Vista Verde',
    q_servico: 'Preventiva',
    q_ok: true,
    q_obs: 'Substituído filtro da unidade 12B.',
    ph_antes: ['https://placehold.co/400x240/e2e8f0/64748b?text=Foto+exemplo'],
  },
};

function logoSrc(cfg) {
  const u = cfg.logoUrl && String(cfg.logoUrl).trim();
  if (u && (/^https?:\/\//i.test(u) || u.startsWith('/'))) return esc(u);
  return 'img/logo.png';
}

function displayOsLabel(t) {
  const on = t.osNumber && String(t.osNumber).trim();
  return on || String(t.id || '').slice(0, 8).toUpperCase();
}

function displayLastRevPreview(t) {
  const n = Number(t?.lastSubmittedRevision) || 0;
  if (n <= 0) return '—';
  if (n === 1) return '1 (inicial)';
  return String(n);
}

function fd(d) {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '—';
  return x.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pdfValueIsEmpty(val) {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val))
    return val.length === 0 || val.every((x) => x == null || String(x).trim() === '');
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

/** @returns {object|null} */
function tryParseObject(val) {
  if (val != null && typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const j = JSON.parse(s);
        return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isTransitPayload(o) {
  return (
    o &&
    typeof o === 'object' &&
    ['SAIDA', 'CHEGADA', 'VALIDACAO_CERCA'].includes(o.action)
  );
}

function formatTransitPayloadHtml(o, th) {
  const isStart = o.action === 'SAIDA';
  const isFence = o.action === 'VALIDACAO_CERCA';
  const d = o.timestamp ? new Date(o.timestamp) : null;
  const timeStr =
    d && !isNaN(d.getTime())
      ? d.toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';
  const title = isFence
    ? 'Validação de cerca'
    : isStart
      ? 'Início de deslocamento (saída)'
      : 'Fim de deslocamento (chegada)';
  const dotColor = isStart ? '#16a34a' : isFence ? '#ca8a04' : '#dc2626';
  let html = `<div style="padding:10px 12px;background:${th.colorSurface};border:1px solid ${th.colorBorder};border-radius:8px;font-size:11px;line-height:1.45">`;
  html += `<div style="font-weight:800;color:${th.colorText};margin-bottom:6px;display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${dotColor};flex-shrink:0"></span>${esc(title)}</div>`;
  html += `<div style="font-size:10px;color:${th.colorMuted};margin-bottom:6px">${esc(timeStr)}</div>`;
  if (o.address) {
    html += `<div style="color:${th.colorMuted};margin-bottom:6px;line-height:1.4">${esc(o.address)}</div>`;
  }
  if (
    o.coordinates &&
    typeof o.coordinates.lat === 'number' &&
    typeof o.coordinates.lng === 'number'
  ) {
    const q = `${o.coordinates.lat},${o.coordinates.lng}`;
    html += `<a href="https://www.google.com/maps?q=${encodeURIComponent(q)}" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:600;font-size:10px">Ver no mapa</a>`;
  }
  if (Array.isArray(o.traversedPath) && o.traversedPath.length > 1) {
    html += `<div style="font-size:9px;color:${th.colorMutedLight};margin-top:8px">Percurso: ${o.traversedPath.length} pontos registados</div>`;
  }
  html += '</div>';
  return html;
}

function formatLocationPickHtml(o, th) {
  const lat = o.lat != null ? o.lat : o.coordinates?.lat;
  const lng = o.lng != null ? o.lng : o.coordinates?.lng;
  if (lat == null || lng == null) return '';
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return '';
  const addr = o.address ? String(o.address) : '';
  let html = `<div style="padding:10px 12px;border:1px solid ${th.colorBorder};border-radius:8px;background:${th.colorSurface};display:flex;gap:10px;align-items:flex-start">`;
  html += `<div style="width:32px;height:32px;border-radius:50%;background:#e0f2fe;flex-shrink:0"></div>`;
  html += `<div style="flex:1;min-width:0">`;
  html += `<div style="font-size:11px;font-weight:800;color:${th.colorText};margin-bottom:4px">Localização (GPS)</div>`;
  if (addr) {
    html += `<div style="font-size:10px;color:${th.colorMuted};margin-bottom:4px;line-height:1.4">${esc(addr)}</div>`;
  }
  html += `<div style="font-size:9px;color:${th.colorMutedLight};font-family:ui-monospace,monospace">${esc(latN.toFixed(5))}, ${esc(lngN.toFixed(5))}</div>`;
  html += `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${latN},${lngN}`)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;color:${th.colorAccent};font-weight:600;font-size:10px">Abrir no mapa</a>`;
  html += '</div></div>';
  return html;
}

/** Assinatura SIG_V1|meta:{...}|path… (igual à Central de Operações) */
function formatSignaturePdfHtml(str, th) {
  const allParts = String(str).replace(/^SIG_V1\|/, '').split('|').filter(Boolean);
  const paths = allParts.filter((p) => !p.startsWith('meta:') && p.trim().length > 2);
  const metaPart = allParts.find((p) => p.startsWith('meta:'));
  let metaHtml = '';
  if (metaPart) {
    try {
      const m = JSON.parse(metaPart.slice(5));
      const bits = [];
      if (m.address) bits.push(esc(m.address));
      if (m.ip && m.ip !== 'Desconhecido') bits.push(`IP: ${esc(m.ip)}`);
      if (bits.length) {
        metaHtml = `<div style="font-size:9px;color:${th.colorMuted};margin-top:6px;line-height:1.5">${bits.join(' · ')}</div>`;
      }
    } catch {
      /* ignore */
    }
  }
  if (paths.length === 0) {
    return `<span style="color:${th.colorMutedLight};font-style:italic">Assinatura vazia</span>${metaHtml}`;
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  paths.forEach((p) => {
    [...p.matchAll(/(-?[\d.]+)/g)].forEach((m2, i) => {
      const v = parseFloat(m2[0]);
      if (i % 2 === 0) {
        minX = Math.min(minX, v);
        maxX = Math.max(maxX, v);
      } else {
        minY = Math.min(minY, v);
        maxY = Math.max(maxY, v);
      }
    });
  });
  let vB = '0 0 350 400';
  if (minX !== Infinity && maxX > minX) {
    const pad = 20;
    vB = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }
  const pathsHtml = paths
    .map(
      (d) =>
        `<path d="${escAttr(d)}" stroke="#0f172a" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    .join('');
  return `<div style="display:inline-block;max-width:100%;background:${th.colorSurface};border:1px solid ${th.colorBorder};border-radius:10px;padding:10px">
    <svg viewBox="${escAttr(vB)}" width="280" height="140" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#fff;border-radius:6px;border:1px solid #f1f5f9">${pathsHtml}</svg>
    <div style="font-size:9px;color:${th.colorMutedLight};margin-top:4px;text-align:center">Assinatura digital · ${paths.length} traço(s)</div>
    ${metaHtml}
  </div>`;
}

/**
 * HTML rico para tipos especiais; `null` → usar ramo genérico.
 * @param {any} val
 * @param {{ id: string, label?: string, type?: string }} f
 * @param {ReturnType<mergeTheme>} th
 */
function formatSpecialFieldHtml(val, f, th) {
  if (val === undefined || val === null || val === '') return null;

  if (typeof val === 'string' && val.startsWith('SIG_V1|')) {
    return formatSignaturePdfHtml(val, th);
  }

  const asObj = tryParseObject(val);
  if (asObj && isTransitPayload(asObj)) {
    return formatTransitPayloadHtml(asObj, th);
  }

  if (asObj && typeof asObj === 'object' && !Array.isArray(asObj) && !isTransitPayload(asObj)) {
    const loc = formatLocationPickHtml(asObj, th);
    if (loc) return loc;
  }

  if (f.type === 'file_upload' && typeof val === 'string') {
    const s = val.trim();
    if (s.startsWith('http://') || s.startsWith('https://')) {
      const base = s.split('?')[0];
      let name = base.split('/').pop() || 'anexo';
      try {
        name = decodeURIComponent(name);
      } catch {
        /* keep */
      }
      return `<a href="${escAttr(s)}" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:700;font-size:12px;word-break:break-all">Download — ${esc(name)}</a>`;
    }
  }

  return null;
}

/** Linha “Tempo: +X%…” — tipografia compacta como no PDF impresso. */
function fmtTransitPctVsPlannedLine(planned, actual, label) {
  const pct = transitPctDeltaVsPlanned(planned, actual);
  if (pct == null || !Number.isFinite(pct)) return '';
  const r = Math.round(pct * 10) / 10;
  const absStr = Math.abs(r).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  });
  const baseStyle =
    'font-size:7px;margin-top:2px;font-weight:700;line-height:1.25';
  if (Math.abs(r) < 0.05) {
    return `<div style="${baseStyle};color:#64748b">${esc(label)}: ≈ igual ao previsto</div>`;
  }
  if (r > 0) {
    return `<div style="${baseStyle};color:#dc2626">${esc(label)}: +${absStr}% acima do previsto</div>`;
  }
  return `<div style="${baseStyle};color:#16a34a">${esc(label)}: ${absStr}% abaixo do previsto</div>`;
}

function haversineKmPreview(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeTransitCardPreview(gpsObj, title, colorHex, iconName) {
  if (!gpsObj) {
    return `
        <div style="flex:1; border:1px dashed #cbd5e1; border-radius:8px; padding:15px; display:flex; gap:12px; align-items:center; background:#fafafa;">
           <div style="width:40px;height:40px;background:#f1f5f9;border-radius:50%;display:flex;justify-content:center;align-items:center;flex-shrink:0;">
              <ion-icon name="${escAttr(iconName)}" style="font-size:20px;color:#cbd5e1"></ion-icon>
           </div>
           <div>
              <div style="font-size:11px;font-weight:900;color:#94a3b8;margin-bottom:4px;">${esc(title)}</div>
              <div style="font-size:10px;color:#cbd5e1;font-style:italic;">Não registrado</div>
           </div>
        </div>`;
  }
  return `
        <div style="flex:1; border: 1px solid #e2e8f0; border-radius: 8px; background:#f8fafc; padding:15px; display:flex; gap:12px; box-shadow: 0 1px 2px rgba(0,0,0,0.02)">
           <div style="width: 40px; height: 40px; background: ${escAttr(colorHex)}15; border: 1px solid ${escAttr(colorHex)}30; border-radius: 50%; display:flex; justify-content:center; align-items:center; flex-shrink:0">
               <ion-icon name="${escAttr(iconName)}" style="font-size:20px; color:${escAttr(colorHex)}"></ion-icon>
           </div>
           <div style="flex:1;">
               <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                   <span style="font-size:11px; font-weight:900; color:#0f172a;">${esc(title)}</span>
                   <span style="font-size:11px; font-weight:800; color:${escAttr(colorHex)}; background:${escAttr(colorHex)}15; padding:2px 6px; border-radius:4px;">${new Date(gpsObj.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
               </div>
               ${gpsObj.addr ? `<div style="font-size:11px; color:#475569; margin-bottom: 6px; line-height:1.4;">${esc(gpsObj.addr)}</div>` : ''}
               <a href="https://maps.google.com/?q=${encodeURIComponent(`${gpsObj.lat},${gpsObj.lng}`)}" target="_blank" rel="noopener noreferrer" style="font-size:10px; color:#3b82f6; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:3px;">
                  <ion-icon name="navigate" style="font-size:12px"></ion-icon> Ver no Mapa
               </a>
           </div>
        </div>
     `;
}

function buildSpeedBadgeHtmlPreview(startGPS, endGPS, t, th) {
  let speedBadgeHtml = '';
  if (startGPS && endGPS) {
    const tm = buildTransitDisplayMetrics(startGPS, endGPS, t);
    const plannedTimeStr = fmtDurationPtBr(tm.plannedDurationSec);
    const plannedDistStr =
      tm.plannedDistanceM != null ? `${(tm.plannedDistanceM / 1000).toFixed(2)} km` : '—';
    let plannedFoot = '—';
    if (tm.plannedSourceKey === 'osrm') plannedFoot = 'Mapa rodoviário (OSRM)';
    else if (tm.plannedSourceKey === 'task_eta') plannedFoot = 'Com base no ETA da OS';
    else if (tm.plannedSourceKey === 'straight_line') {
      plannedFoot = 'Distância em linha reta · tempo não estimado';
    } else if (tm.plannedSourceKey === 'task_eta_legacy') {
      plannedFoot = 'ETA da OS (sem registo detalhado na saída)';
    }

    let transitSeconds = tm.actualDurationSec;
    if (transitSeconds == null || !Number.isFinite(transitSeconds) || transitSeconds <= 0) {
      transitSeconds = 1;
    }
    const realStr = fmtDurationPtBr(tm.actualDurationSec);

    const actualKm =
      tm.actualDistanceM != null && tm.actualDistanceM > 0 ? tm.actualDistanceM / 1000 : null;
    const speedKmh =
      actualKm != null && transitSeconds > 0 ? actualKm / (transitSeconds / 3600) : null;
    const speedStr =
      speedKmh != null && Number.isFinite(speedKmh) ? speedKmh.toFixed(1) : '—';

    const destLat = parseFloat(t.locationLat);
    const destLng = parseFloat(t.locationLng);
    const hasDestCoords = !isNaN(destLat) && !isNaN(destLng);

    let reachedDestination = true;
    let distToDestKm = 0;
    let incompleteWarningHtml = '';

    if (hasDestCoords) {
      distToDestKm = haversineKmPreview(endGPS.lat, endGPS.lng, destLat, destLng);
      reachedDestination = distToDestKm <= 0.5;

      if (!reachedDestination) {
        incompleteWarningHtml = `
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:10px 14px;margin-top:12px;display:flex;align-items:center;gap:10px;">
              <ion-icon name="warning-outline" style="font-size:20px;color:#DC2626;flex-shrink:0"></ion-icon>
              <div>
                <div style="font-size:11px;font-weight:900;color:#DC2626;">DESLOCAMENTO INCOMPLETO</div>
                <div style="font-size:10px;color:#7F1D1D;margin-top:2px;line-height:1.4;">
                  O técnico encerrou o deslocamento <strong>${distToDestKm.toFixed(2)} km</strong> antes de chegar ao destino.<br>
                  A comparação com o plano previsto pode não ser representativa.
                </div>
              </div>
            </div>`;
      }
    }

    let etaDeltaHtml = '';
    const plannedForDeltaSec =
      tm.plannedDurationSec != null
        ? tm.plannedDurationSec
        : t.etaMinutes != null && Number.isFinite(Number(t.etaMinutes))
          ? Math.round(Number(t.etaMinutes) * 60)
          : null;
    if (
      plannedForDeltaSec != null &&
      tm.actualDurationSec != null &&
      Number.isFinite(tm.actualDurationSec)
    ) {
      if (reachedDestination) {
        const etaRealMin = Math.round(tm.actualDurationSec / 60);
        const plannedMin = Math.round(plannedForDeltaSec / 60);
        const delta = etaRealMin - plannedMin;
        const absDelta = Math.abs(delta);
        const dH = Math.floor(absDelta / 60);
        const dM = absDelta % 60;
        const deltaStr = `${dH > 0 ? dH + 'h ' : ''}${dM}m`;
        if (delta > 5) {
          etaDeltaHtml = `<div style="font-size:8px;color:#dc2626;font-weight:700;margin-top:2px">+${deltaStr} vs previsto</div>`;
        } else if (delta < -5) {
          etaDeltaHtml = `<div style="font-size:8px;color:#16a34a;font-weight:700;margin-top:2px">${deltaStr} abaixo do previsto ✓</div>`;
        } else {
          etaDeltaHtml = `<div style="font-size:8px;color:#2563eb;font-weight:700;margin-top:2px">Próximo do previsto ≈</div>`;
        }
      } else {
        etaDeltaHtml = `<div style="font-size:8px;color:#dc2626;font-weight:700;margin-top:2px">⚠ não concluído</div>`;
      }
    }

    const actualDistHint = tm.actualDistFromPolyline ? 'trajeto GPS' : 'aprox. (reta ou registo)';
    const remainHtml =
      !reachedDestination && hasDestCoords
        ? `<div style="font-size:8px;color:#DC2626;font-weight:700;margin-top:2px">${distToDestKm.toFixed(2)} km p/ destino</div>`
        : '';

    const bgColor = reachedDestination ? '#FFF7ED' : '#FFFBEB';
    const borderColor = reachedDestination ? '#FFEDD5' : '#FDE68A';

    const actualDistVal =
      actualKm != null ? `${actualKm.toFixed(2)} <span style="font-size:10px">km</span>` : '—';

    speedBadgeHtml = `
        <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:8px; padding:8px; margin-top:8px; display:flex; justify-content:space-around; align-items:flex-start; flex-wrap:wrap; gap:6px;">
           <div style="text-align:center;min-width:88px;">
              <div style="font-size:8px;color:#C2410C;font-weight:bold;letter-spacing:0.5px">PREVISTO (SAÍDA)</div>
              <div style="font-size:13px;font-weight:900;color:#9A3412;margin-top:2px;line-height:1.25;">${plannedTimeStr}</div>
              <div style="font-size:12px;font-weight:800;color:#b45309;margin-top:1px;">${plannedDistStr}</div>
              <div style="font-size:7px;color:#9a3412;margin-top:2px;font-style:italic;line-height:1.2;">${esc(plannedFoot)}</div>
           </div>
           <div style="width:1px;height:52px;background:#FED7AA;align-self:center;"></div>
           <div style="text-align:center;min-width:100px;">
              <div style="font-size:8px;color:#C2410C;font-weight:bold;letter-spacing:0.5px">REALIZADO (CHEGADA)</div>
              <div style="font-size:13px;font-weight:900;color:#9A3412;margin-top:2px;line-height:1.25;">${realStr}</div>
              <div style="font-size:12px;font-weight:800;color:#b45309;margin-top:1px;">${actualDistVal}</div>
              <div style="font-size:7px;color:#9a3412;margin-top:2px;font-style:italic;">${esc(actualDistHint)}</div>
              ${etaDeltaHtml}
              ${remainHtml}
              ${fmtTransitPctVsPlannedLine(tm.plannedDurationSec, tm.actualDurationSec, 'Tempo')}
              ${fmtTransitPctVsPlannedLine(tm.plannedDistanceM, tm.actualDistanceM, 'Distância')}
           </div>
           <div style="width:1px;height:52px;background:#FED7AA;align-self:center;"></div>
           <div style="text-align:center;min-width:88px;">
              <div style="font-size:8px;color:#C2410C;font-weight:bold;letter-spacing:0.5px">VELOCIDADE MÉDIA</div>
              <div style="font-size:14px;font-weight:900;color:#9A3412;margin-top:4px;">${speedStr} <span style="font-size:10px">km/h</span></div>
              <div style="font-size:7px;color:#9a3412;margin-top:3px;font-style:italic;">dist. real ÷ tempo</div>
           </div>
        </div>
        ${incompleteWarningHtml}`;
  } else {
    const tm0 = buildTransitDisplayMetrics(startGPS, endGPS, t);
    const pTime = fmtDurationPtBr(tm0.plannedDurationSec);
    const pDist =
      tm0.plannedDistanceM != null ? `${(tm0.plannedDistanceM / 1000).toFixed(2)} km` : '—';
    const aTime = fmtDurationPtBr(tm0.actualDurationSec);
    const aDist =
      tm0.actualDistanceM != null ? `${(tm0.actualDistanceM / 1000).toFixed(2)} km` : '—';
    const pctTime0 = fmtTransitPctVsPlannedLine(
      tm0.plannedDurationSec,
      tm0.actualDurationSec,
      'Tempo',
    );
    const pctDist0 = fmtTransitPctVsPlannedLine(
      tm0.plannedDistanceM,
      tm0.actualDistanceM,
      'Distância',
    );
    speedBadgeHtml = `
        <div style="background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px; padding:6px; margin-top:8px; display:flex; justify-content:space-around; align-items:center; flex-wrap:wrap; gap:4px;">
           <div style="text-align:center;min-width:80px;"><div style="font-size:9px;color:#94a3b8;font-weight:bold;">PREVISTO (tempo)</div><div style="font-size:13px;font-weight:700;color:#cbd5e1;margin-top:2px;">${pTime}</div></div>
           <div style="width:1px;height:24px;background:#e2e8f0;"></div>
           <div style="text-align:center;min-width:80px;"><div style="font-size:9px;color:#94a3b8;font-weight:bold;">PREVISTO (dist.)</div><div style="font-size:13px;font-weight:700;color:#cbd5e1;margin-top:2px;">${pDist}</div></div>
           <div style="width:1px;height:24px;background:#e2e8f0;"></div>
           <div style="text-align:center;min-width:80px;"><div style="font-size:9px;color:#94a3b8;font-weight:bold;">REAL (tempo)</div><div style="font-size:13px;font-weight:700;color:#cbd5e1;margin-top:2px;">${aTime}</div>${pctTime0}</div>
           <div style="width:1px;height:24px;background:#e2e8f0;"></div>
           <div style="text-align:center;min-width:80px;"><div style="font-size:9px;color:#94a3b8;font-weight:bold;">REAL (dist.)</div><div style="font-size:13px;font-weight:700;color:#cbd5e1;margin-top:2px;">${aDist}</div>${pctDist0}</div>
           <div style="width:1px;height:24px;background:#e2e8f0;"></div>
           <div style="text-align:center;min-width:80px;"><div style="font-size:9px;color:#94a3b8;font-weight:bold;">VMÉDIA</div><div style="font-size:13px;font-weight:700;color:#cbd5e1;margin-top:2px;">—</div></div>
        </div>`;
  }
  return speedBadgeHtml;
}

const PDF_STATUS_BADGE = {
  PENDING: { bg: '#fef9c3', fg: '#854d0e', lab: 'Pendente' },
  RECEIVED: { bg: '#bfdbfe', fg: '#1e40af', lab: 'Aparelho Recebeu' },
  ACCEPTED: { bg: '#bfdbfe', fg: '#1e3a8a', lab: 'Técnico Aceitou' },
  IN_PROGRESS: { bg: '#fef3c7', fg: '#92400e', lab: 'Em Execução' },
  PAUSED: { bg: '#fee2e2', fg: '#991b1b', lab: 'Pausada' },
  COMPLETED: { bg: '#bbf7d0', fg: '#14532d', lab: 'Concluída' },
  SYNCED: { bg: '#bbf7d0', fg: '#14532d', lab: 'Sincronizada' },
  CANCELLED: { bg: '#fecaca', fg: '#991b1b', lab: 'Cancelada' },
  REJECTED: { bg: '#fecaca', fg: '#991b1b', lab: 'Rejeitada' },
};

const ZONE_LABEL_PDF = {
  point: 'Ponto (Raio)',
  route: 'Rota (Polilinha)',
  segment: 'Trecho (A→B)',
  polygon: 'Polígono',
};

function buildPdfProdBlockForPreview(th, t, responses) {
  const { startGPS: sgProd, endGPS: egProd } = extractTransitEndpointsForReport(responses);
  const transitSecProd = computeTransitSecondsFromEndpoints(sgProd, egProd);
  const osWallSecProd =
    t.startedAt && t.completedAt
      ? Math.max(
          0,
          Math.floor(
            (new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime()) / 1000,
          ),
        )
      : null;
  const exTransitSecProd =
    osWallSecProd != null && transitSecProd != null ? Math.max(0, osWallSecProd - transitSecProd) : null;

  let durationStr = '—';
  if (t.startedAt && t.completedAt) {
    const durationMs = new Date(t.completedAt) - new Date(t.startedAt);
    const h = Math.floor(durationMs / 3600000);
    const m = Math.floor((durationMs % 3600000) / 60000);
    const s = Math.floor((durationMs % 60000) / 1000);
    durationStr = `${h}h ${m}m ${s}s`;
  }

  const fillSecPdf = Number(
    t.metadata?.formFillDurationSeconds ??
      t.metadata?.durationSeconds ??
      responses.__form_fill_duration_sec,
  );
  const activeSecPdf = Number(t.metadata?.formActiveSeconds ?? responses.__form_active_seconds_final);
  const formFillStrPdf = fmtDurationPtBr(fillSecPdf);
  const formActiveStrPdf = fmtDurationPtBr(activeSecPdf);

  const sectionRowsProd = collectSectionTimingRowsForPreview(t.template?.sectionBreaks, responses);
  let sectionLineProd = sectionRowsProd
    .map((r) => {
      const short = r.label.length > 24 ? r.label.slice(0, 24) + '…' : r.label;
      return `<strong>${esc(short)}</strong> ${r.sec != null ? fmtDurationPtBr(r.sec) : '—'}`;
    })
    .join(' <span style="color:#cbd5e1">|</span> ');
  if (sectionLineProd.length > 400) sectionLineProd = sectionLineProd.slice(0, 400) + '…';

  const pdfPauseInProdHtml = buildPauseProductivityPdfFragment(esc, fmtDurationPtBr, t, responses);

  const pdfProdMetricCell = (label, valueInner, isLast) => `
        <div style="text-align:center;padding:10px 6px;${isLast ? '' : `border-right:1px solid ${th.colorBorder};`}min-width:0">
          <div style="font-size:7px;color:#64748b;font-weight:800;letter-spacing:0.35px;text-transform:uppercase;line-height:1.2">${esc(label)}</div>
          <div style="font-size:11px;font-weight:900;color:#0f172a;margin-top:5px;line-height:1.15;word-break:break-word">${valueInner}</div>
        </div>`;

  return `
      <div style="margin:10px 10px 12px;box-sizing:border-box;">
        <div class="pdf-section-title" style="margin-top:4px;border-bottom:1px solid ${th.colorBorder};padding-bottom:5px;">
          <ion-icon name="stats-chart-outline" style="font-size:17px;color:${th.transitAccent};vertical-align:-3px"></ion-icon>
          PRODUTIVIDADE DO TÉCNICO
        </div>
        <div style="margin-top:11px;border:1px solid ${th.colorBorder};border-radius:10px;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,0.07);overflow:hidden;">
          <div style="padding:0;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);border-bottom:1px solid ${th.colorBorder};">
            <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));align-items:stretch">
              ${pdfProdMetricCell('OS (ini→fim)', durationStr, false)}
              ${pdfProdMetricCell('Desloc.', transitSecProd != null ? fmtDurationPtBr(transitSecProd) : '—', false)}
              ${pdfProdMetricCell('Fora desl. (est.)', exTransitSecProd != null ? fmtDurationPtBr(exTransitSecProd) : '—', false)}
              ${pdfProdMetricCell('No form.', formFillStrPdf, false)}
              ${pdfProdMetricCell('App foco', formActiveStrPdf, true)}
            </div>
          </div>
          <div style="padding:10px 12px 12px;background:#fff;">
            <div style="padding:10px 12px;background:#FFF7ED;border:1px solid #FFEDD5;border-radius:8px;box-sizing:border-box">
              <div style="font-size:8px;font-weight:900;color:#9A3412;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px">
                <ion-icon name="git-branch-outline" style="font-size:14px;color:${th.transitAccent}"></ion-icon> Etapas no formulário
              </div>
              <div style="font-size:8px;color:#78350f;line-height:1.45;font-weight:600">${sectionLineProd || '<span style="color:#ca8a04;font-weight:500">Sem tempos por etapa registados.</span>'}</div>
            </div>
            ${pdfPauseInProdHtml}
          </div>
        </div>
      </div>`;
}

/**
 * @param {object} cfg — mergePresetConfig(...)
 * @param {object} task — task painel (MOCK_PREVIEW_TASK ou carregada da API)
 * @param {Array<{id:string,label:string,type?:string}>} schemaFields
 */
export function buildReportPreviewHtml(cfg, task, schemaFields) {
  const m = cfg.modules || {};
  const responses = task.responses || {};
  const t = task;
  const th = mergeTheme(cfg.theme);
  const moduleOrder = normalizeModuleOrder(cfg.moduleOrder);

  let qNum = 1;
  let formHtml = '';

  for (const f of schemaFields || []) {
    if (!f || !f.id) continue;
    if (!isFieldVisible(cfg, f.id)) continue;
    if (f.type === 'transit_start' || f.type === 'transit_end') continue;
    const pTypes = ['photo', 'photo_stamped', 'facial_recognition'];
    if (pTypes.includes(f.type) && !m.photoGallery) continue;

    const val = responses[f.id];
    if (cfg.hideEmptyFields && f.type !== 'section_break' && pdfValueIsEmpty(val)) continue;

    const lab = fieldLabelOverride(cfg, f.id) || f.label || f.id;

    const tIso = responses[`__time_${f.id}`];
    let timeHtml = '';
    if (tIso) {
      const humanTime = new Date(tIso).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      timeHtml = `<span style="font-size:9px; color:#94a3b8; margin-left:8px; font-weight:600; text-transform:none;"><ion-icon name="time-outline" style="vertical-align:-2px; margin-right:2px;"></ion-icon>${esc(humanTime)}</span>`;
    }

    if (f.type === 'photo' || f.type === 'photo_stamped' || f.type === 'facial_recognition') {
      const urls = Array.isArray(val) ? val : val != null ? [val] : [];
      const first = urls[0] != null ? String(urls[0]) : '';
      const stampTypes = f.type === 'photo_stamped' || f.type === 'facial_recognition';
      const timestamp = t.completedAt
        ? new Date(t.completedAt).toLocaleString('pt-BR')
        : fd(t.createdAt);
      let inner;
      if (
        first.startsWith('http://') ||
        first.startsWith('https://') ||
        first.startsWith('data:image')
      ) {
        const baseSrc = esc(first.split('?')[0]);
        const showFooter = !!(stampTypes || first.includes('live'));
        inner = `
          <div class="pdf-photo-card" style="margin-top:8px;max-width:350px;background:#EA580C;border:1px solid #c2410c;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
            <img src="${baseSrc}" class="pdf-photo-img" style="border-radius:0;width:100%;height:auto;min-height:180px;object-fit:cover;display:block" alt="" onerror="this.src='https://placehold.co/400x300?text=Foto'" />
            ${
              showFooter
                ? `<div style="background:#EA580C;color:#fff;padding:10px 12px;font-size:8px;font-weight:700;line-height:1.4;box-sizing:border-box;font-family:monospace">🕒 ${esc(timestamp)}</div>`
                : ''
            }
          </div>`;
      } else if (first.startsWith('file://')) {
        inner = `<div style="margin-top:8px;padding:20px;max-width:350px;background:#f8fafc;text-align:center;border:2px dashed #cbd5e1;border-radius:8px;">
          <ion-icon name="cloud-offline-outline" style="font-size:32px;color:#94a3b8;margin-bottom:8px;"></ion-icon>
          <div style="font-size:12px;color:#475569;font-weight:800;">MÍDIA PENDENTE</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px;">Aguardando sincronização para pré-visualizar a foto.</div>
        </div>`;
      } else if (first) {
        inner = `<div style="padding:12px;border:1px solid ${th.colorBorder};border-radius:8px;font-size:10px;color:${th.colorMuted}">Pré-visualização indisponível para este ficheiro</div>`;
      } else {
        inner = `<div class="pdf-photo-card" style="margin-top:8px;max-width:350px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <img class="pdf-photo-img" style="min-height:180px;border-radius:0" src="https://placehold.co/360x200/f1f5f9/94a3b8?text=Foto" alt="" />
        </div>`;
      }
      formHtml += `
        <div class="pdf-form-item" style="position:relative;">
           <div class="pdf-form-num" style="background:${th.formNumBg}">${qNum++}</div>
           <div class="pdf-q" style="display:flex; justify-content:space-between; align-items:center;">
             <span>${esc(lab)}</span>
             ${timeHtml}
           </div>
           <div class="pdf-a">${inner}</div>
        </div>`;
      continue;
    }

    const special = formatSpecialFieldHtml(val, f, th);
    let display;
    if (special != null) {
      display = special;
    } else if (val === undefined || val === null || val === '') {
      display = `<span style="color:${th.colorMutedLight};font-style:italic">Não preenchido</span>`;
    } else if (typeof val === 'boolean') {
      display = val
        ? `<span class="pdf-pill" style="background:${th.pillYesBg}">Sim</span>`
        : `<span class="pdf-pill" style="background:${th.pillNoBg}">Não</span>`;
    } else if (f.type === 'dropdown') {
      display = `<span class="pdf-pill" style="background:${th.pillYesBg}">${esc(val)}</span>`;
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      display = `<pre style="margin:0;font-size:9px;font-family:ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;color:${th.colorMuted};line-height:1.4">${esc(JSON.stringify(val, null, 2))}</pre>`;
    } else {
      display = `<span>${esc(val)}</span>`;
    }

    formHtml += `
        <div class="pdf-form-item" style="position:relative;">
           <div class="pdf-form-num" style="background:${th.formNumBg}">${qNum++}</div>
           <div class="pdf-q" style="display:flex; justify-content:space-between; align-items:center;">
             <span>${esc(lab)}</span>
             ${timeHtml}
           </div>
           <div class="pdf-a">${display}</div>
        </div>`;
  }

  const rawAvatar = t.ownerAvatar || '';
  let avatarUrl = '';
  if (
    rawAvatar.startsWith('http://') ||
    rawAvatar.startsWith('https://') ||
    rawAvatar.startsWith('data:image')
  ) {
    avatarUrl = rawAvatar;
  } else if (rawAvatar.startsWith('/') && typeof window !== 'undefined' && window.location) {
    avatarUrl = `${window.location.origin}${rawAvatar}`;
  } else {
    avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent((t.ownerEmail || 'T').split('@')[0])}&background=EA580C&color=fff&size=100&bold=true`;
  }

  const bannerTitle = esc(cfg.reportTitle || 'RELATÓRIO DA ATIVIDADE');
  const bannerSub = esc(cfg.reportSubtitle || `${displayOsLabel(t)} · pré-visualização`);

  const st = PDF_STATUS_BADGE[t.status] || {
    bg: '#e2e8f0',
    fg: '#475569',
    lab: t.status || '—',
  };

  const { startGPS: stPrev, endGPS: enPrev } = extractTransitEndpointsForReport(responses);

  const zoneTypeLabel =
    ZONE_LABEL_PDF[t.locationZoneType] ||
    (t.locationZoneType ? esc(String(t.locationZoneType)) : '—');

  const obsBlockPdf =
    t.metadata?.notes || t.metadata?.observation
      ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed ${th.colorBorder}"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Observação</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.metadata?.notes || t.metadata?.observation)}</div></div>`
      : '';

  const techInner = `
      <div style="background:linear-gradient(135deg,${th.techHeaderStart} 0%,${th.techHeaderEnd} 100%); padding:10px 14px; display:flex; align-items:center; gap:8px">
        <ion-icon name="document-text-outline" style="font-size:16px; color:${th.colorMutedLight}"></ion-icon>
        <span style="font-size:11px; font-weight:900; color:#fff; letter-spacing:0.8px; text-transform:uppercase">Dados Técnicos da Atividade</span>
        <span style="margin-left:auto; background:${st.bg}; color:${st.fg}; padding:3px 10px; border-radius:99px; font-size:9px; font-weight:800; letter-spacing:0.5px">${esc(st.lab)}</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0">
        <div style="padding:10px; border-right:1px solid ${th.colorBorder}">
          <div style="font-size:8px; font-weight:900; color:${th.colorMuted}; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid ${th.colorBorder}; display:flex; align-items:center; gap:4px">
            <ion-icon name="information-circle-outline" style="font-size:12px"></ion-icon> Identificação
          </div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Nº OS</div><div style="font-size:10px;color:${th.colorText};font-weight:800;margin-top:1px;font-family:monospace;word-break:break-all">${esc(displayOsLabel(t))}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Submissão indexada (última)</div><div style="font-size:10px;color:${th.colorText};font-weight:800;margin-top:1px">${esc(displayLastRevPreview(t))}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Reaberturas</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${Number(t.metadata?.reopenCount) > 0 ? esc(String(t.metadata.reopenCount)) : '—'}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">ID técnico</div><div style="font-size:9px;color:${th.colorText};font-weight:600;margin-top:1px;font-family:monospace;word-break:break-all">${esc(t.id || '')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Ref. Integração</div><div style="font-size:9px;color:${th.colorText};font-weight:600;margin-top:1px;font-family:monospace">${esc(t.refId || t.metadata?.refId || '—')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Local / Ativo</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.title || '—')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Descrição</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.description || 'Não preenchido')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Formulário</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.template?.title || 'N/A')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Prioridade</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.metadata?.priority || 'Normal')}</div></div>
          <div><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Origem</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.metadata?.devicePlatform || 'Painel Admin')}</div></div>
          ${obsBlockPdf}
        </div>
        <div style="padding:10px; border-right:1px solid ${th.colorBorder}; background:${th.colDispatchBg}">
          <div style="font-size:8px; font-weight:900; color:${th.colDispatch}; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid ${th.colorBorder}; display:flex; align-items:center; gap:4px">
            <ion-icon name="calendar-outline" style="font-size:12px; color:${th.colDispatch}"></ion-icon> Despacho
          </div>
          <div style="margin-bottom:6px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Data/Hora (Criação)</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${fd(t.createdAt)}</div></div>
          <div style="margin-bottom:6px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Sincronização ao Aparelho</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${fd(t.metadata?.receivedAt || t.syncedAt) || '—'}</div></div>
          <div style="margin-bottom:6px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Aceite pelo Técnico</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${fd(t.metadata?.acceptedAt) || '—'}</div></div>
          <div><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Zona de Atuação</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${zoneTypeLabel}</div></div>
        </div>
        <div style="padding:10px; background:${th.colExecBg}">
          <div style="font-size:8px; font-weight:900; color:${th.colExec}; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid ${th.colorBorder}; display:flex; align-items:center; gap:4px">
            <ion-icon name="checkmark-done-outline" style="font-size:12px; color:${th.colExec}"></ion-icon> Execução
          </div>
          <div style="margin-bottom:6px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Início da Execução</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${fd(t.startedAt) || '—'}</div></div>
          <div style="margin-bottom:6px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Saída (Início Deslocamento)</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${stPrev ? new Date(stPrev.time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div></div>
          <div style="margin-bottom:6px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Chegada (Fim Deslocamento)</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${enPrev ? new Date(enPrev.time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</div></div>
          <div><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Conclusão da OS</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${fd(t.completedAt) || '—'}</div></div>
        </div>
      </div>`;

  const htmlTechnicalCard = (includeProductivity) =>
    `<div style="margin-top:10px; border:1px solid ${th.colorBorder}; border-radius:10px; background:#fff; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06)">${techInner}${
      includeProductivity
        ? buildPdfProdBlockForPreview(th, t, responses)
        : ''
    }</div>`;

  const pieceTopbar = m.topbar
    ? `<div class="pdf-topbar" style="border-bottom:none">
       <div style="display:flex; align-items:center; gap:8px;">
           <img src="${logoSrc(cfg)}" style="height:24px; width:auto; border-radius:4px;" alt="" />
           <span style="font-size:12px; color:${th.colorMutedLight}; margin-left:8px; padding-left:8px; border-left:1px solid ${th.colorBorder}">${fd(new Date())}</span>
       </div>
       <div style="font-size:11px; font-weight:600; color:${th.colorMuted}; background:${th.topbarBadgeBg}; padding:4px 8px; border-radius:4px">Relatório de atividade de campo</div>
    </div>`
    : '';

  const pieceHeaderBanner = m.headerBanner
    ? `<div class="pdf-header-banner" style="background: linear-gradient(135deg, ${th.bannerGradientStart} 0%, ${th.bannerGradientEnd} 100%); position:relative; overflow:hidden; margin-top:5px; margin-bottom:22px; height:70px; border-radius:8px;">
       <div style="position:absolute; top:-20px; right:-20px; width:150px; height:150px; background:#ffffff10; border-radius:50%"></div>
       <div class="pdf-summary-plate">
          <h2>${bannerTitle}</h2>
          <span>${bannerSub}</span>
       </div>
       <div class="pdf-tech-info">
          <div class="pdf-tech-texts">
             <div class="pdf-tech-name" style="color:#f8fafc">${esc((t.ownerEmail || 't').split('@')[0].toUpperCase())}</div>
             <div class="pdf-tech-mail" style="color:#93c5fd">${esc(t.ownerEmail || '—')}</div>
          </div>
          <div class="pdf-tech-avatar" style="border:2px solid #fff">
             <img src="${escAttr(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />
          </div>
       </div>
    </div>`
    : '';

  const pdfCreationRevHint =
    Number(t.lastSubmittedRevision) > 1 &&
    (t.metadata?.reopenedByAdminAt || t.metadata?.reopenedAt || t.completedAt)
      ? `<div class="pdf-timeline-rev-hint">rev ${fd(t.metadata?.reopenedByAdminAt || t.metadata?.reopenedAt || t.completedAt)}</div>`
      : '';

  const pieceTimeline = m.timeline
    ? `<div class="pdf-box" style="margin-top:6px;margin-bottom:6px;padding-bottom:8px;border-color:${th.colorBorder};background:${th.colorSurface}">
       <div class="pdf-box-title" style="margin-bottom:8px;color:${th.colorText}">LINHA DO TEMPO OPERACIONAL</div>
       <div class="pdf-timeline">
          <div class="pdf-timeline-node">
             <div class="pdf-timeline-icon bg-blue"><ion-icon name="create-outline"></ion-icon></div>
             <div class="pdf-timeline-label">Criação</div>
             <div class="pdf-timeline-date">${fd(t.createdAt)}</div>
             ${pdfCreationRevHint}
          </div>
          <div class="pdf-timeline-node">
             <div class="pdf-timeline-icon bg-blue"><ion-icon name="sync-outline"></ion-icon></div>
             <div class="pdf-timeline-label">Sincronização</div>
             <div class="pdf-timeline-date">${fd(t.metadata?.receivedAt || t.syncedAt)}</div>
          </div>
          <div class="pdf-timeline-node" style="opacity:${stPrev ? '1' : '0.35'}">
             <div class="pdf-timeline-icon bg-orange"><ion-icon name="car-sport-outline"></ion-icon></div>
             <div class="pdf-timeline-label">Deslocamento</div>
             <div class="pdf-timeline-date">${
               stPrev && stPrev.time
                 ? new Date(stPrev.time).toLocaleTimeString('pt-BR', {
                     hour: '2-digit',
                     minute: '2-digit',
                   })
                 : '—'
             }</div>
          </div>
          <div class="pdf-timeline-node">
             <div class="pdf-timeline-icon bg-green"><ion-icon name="flag-outline"></ion-icon></div>
             <div class="pdf-timeline-label">Início</div>
             <div class="pdf-timeline-date">${fd(t.startedAt)}</div>
          </div>
          <div class="pdf-timeline-node">
             <div class="pdf-timeline-icon bg-green"><ion-icon name="checkmark-outline"></ion-icon></div>
             <div class="pdf-timeline-label">Conclusão</div>
             <div class="pdf-timeline-date">${fd(t.completedAt)}</div>
          </div>
       </div>
    </div>`
    : '';

  const pieceTransit = m.transit
    ? `
    <div class="pdf-section-title" style="margin-top:12px; border-bottom:1px solid ${th.colorBorder}; padding-bottom:4px;">
       <ion-icon name="car-sport-outline" style="font-size:16px; color:${th.transitAccent}"></ion-icon>
       RESUMO DE DESLOCAMENTO
    </div>
    <div style="display:flex; gap:15px; margin-top:12px;">
       ${makeTransitCardPreview(stPrev, 'INÍCIO DO DESLOCAMENTO', th.timelineBlue, 'play')}
       ${makeTransitCardPreview(enPrev, 'FIM DO DESLOCAMENTO', th.pillNoBg, 'stop')}
    </div>
    ${buildSpeedBadgeHtmlPreview(stPrev, enPrev, t, th)}
  `
    : '';

  const pieceForm = m.formResponses
    ? `<div class="pdf-section-title" style="border-bottom:1px solid ${th.colorBorder}; padding-bottom:8px; page-break-before: always;">
       <ion-icon name="document-text-outline" style="font-size:20px; color:${th.colorAccent}"></ion-icon>
       RESPOSTAS DO FORMULÁRIO
    </div>
    <div style="padding-left:15px; margin-top:12px">
      <div class="pdf-form-grid">
         <div class="pdf-form-line"></div>
         ${formHtml || `<div class="pdf-form-item"><div class="pdf-q" style="color:${th.colorMutedLight}">Sem campos visíveis</div></div>`}
      </div>
    </div>`
    : '';

  const piecePhoto =
    m.photoGallery
      ? `<div class="pdf-section-title" style="margin-top:35px; border-bottom:1px solid ${th.colorBorder}; padding-bottom:8px;">
         <ion-icon name="camera-outline" style="font-size:20px; color:${th.photoAccent}"></ion-icon>
         EVIDÊNCIAS FOTOGRÁFICAS
      </div>
      <div class="pdf-photo-grid" style="margin-top:12px">
        <div class="pdf-photo-card"><div class="pdf-photo-title">Exemplo de galeria</div>
        <img class="pdf-photo-img" src="https://placehold.co/400x180/e2e8f0/64748b?text=Galeria+PDF" alt="" /></div>
      </div>`
      : '';

  const pieceFooter = m.footer
    ? `<div class="pdf-footer" style="margin-top:50px; border-top:1px solid ${th.colorBorder}; padding-top:15px; display:flex; justify-content:space-between; color:${th.colorMuted}; font-size:10px;">
       <div>Gerado pela <strong>BrSpark Admin Central de Operações</strong> — pré-visualização</div>
       <div>www.brspark.com</div>
    </div>`
    : '';

  const themeStyle = `<style>
#preview-root.pdf-theme-root .pdf-theme-scope .bg-blue{background:${th.timelineBlue}!important}
#preview-root.pdf-theme-root .pdf-theme-scope .bg-green{background:${th.timelineGreen}!important}
#preview-root.pdf-theme-root .pdf-theme-scope .bg-orange{background:${th.timelineOrange}!important}
#preview-root.pdf-theme-root .pdf-theme-scope .pdf-form-line{background:${th.colorBorder}!important}
#preview-root.pdf-theme-root .pdf-theme-scope .pdf-form-num{background:${th.formNumBg}!important}
#preview-root.pdf-theme-root .pdf-theme-scope .pdf-timeline::before{background:linear-gradient(90deg,${th.timelineBlue} 0%,${th.timelineGreen} 100%)!important}
</style>`;

  const orderedParts = [];
  let oi = 0;
  while (oi < moduleOrder.length) {
    const k = moduleOrder[oi];
    if (!m[k]) {
      oi++;
      continue;
    }
    if (k === 'technicalBlock') {
      const mergeProd =
        m.productivity && moduleOrder[oi + 1] === 'productivity' && m.productivity;
      orderedParts.push(htmlTechnicalCard(mergeProd));
      oi += mergeProd ? 2 : 1;
      continue;
    }
    if (k === 'productivity') {
      orderedParts.push(
        `<div style="margin-top:10px">${buildPdfProdBlockForPreview(th, t, responses)}</div>`,
      );
      oi++;
      continue;
    }
    if (k === 'topbar') {
      orderedParts.push(pieceTopbar);
      oi++;
      continue;
    }
    if (k === 'headerBanner') {
      orderedParts.push(pieceHeaderBanner);
      oi++;
      continue;
    }
    if (k === 'timeline') {
      orderedParts.push(pieceTimeline);
      oi++;
      continue;
    }
    if (k === 'transit') {
      orderedParts.push(pieceTransit);
      oi++;
      continue;
    }
    if (k === 'formResponses') {
      orderedParts.push(pieceForm);
      oi++;
      continue;
    }
    if (k === 'photoGallery') {
      orderedParts.push(piecePhoto);
      oi++;
      continue;
    }
    if (k === 'footer') {
      orderedParts.push(pieceFooter);
      oi++;
      continue;
    }
    oi++;
  }

  const scopeStyle = `font-family:${escAttr(th.fontFamily)};color:${escAttr(th.colorText)};font-size:${12 * th.fontScale}px;line-height:1.45`;
  return `${themeStyle}<div class="pdf-theme-scope" style="${scopeStyle}">${orderedParts.join('\n')}</div>`;
}
