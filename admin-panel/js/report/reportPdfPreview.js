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
  transitPctDeltaVsPlanned,
  normalizeTraversedPathForReport,
  resolveProductivityFromTask,
} from './previewExecutionMetrics.js';
import {
  collectSectionTimingRowsForPreview,
  buildPauseProductivityPdfFragment,
  buildVisionChecklistReportHtml,
} from './pdfStandardBlocks.js';
import { buildPreviewPdfEntries } from './pdfPreviewFormEntries.js';
import { formatServiceLocationInnerHtml } from './serviceLocationFormat.js';

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
  { id: 'tr_in', label: 'Início deslocamento', type: 'transit_start' },
  { id: 'tr_out', label: 'Fim deslocamento', type: 'transit_end' },
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
  locationZoneType: 'route',
  locationRadius: 100,
  locationPolygon: [
    [-23.561, -46.655],
    [-23.562, -46.656],
    [-23.5635, -46.6545],
  ],
  locationAddress: 'Av. Paulista, 1000 — São Paulo',
  template: { title: 'Checklist manutenção predial' },
  responses: {
    q_cliente: 'Condomínio Vista Verde',
    q_servico: 'Preventiva',
    q_ok: true,
    q_obs: 'Substituído filtro da unidade 12B.',
    ph_antes: ['https://placehold.co/400x240/e2e8f0/64748b?text=Foto+exemplo'],
    tr_in: JSON.stringify({
      action: 'SAIDA',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      address: 'Base operacional',
      coordinates: { lat: -23.56, lng: -46.654 },
    }),
    tr_out: JSON.stringify({
      action: 'CHEGADA',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      address: 'Linha de patrulha — término',
      coordinates: { lat: -23.563, lng: -46.655 },
      traversedPath: [
        [-23.5608, -46.6548],
        [-23.5615, -46.6555],
        [-23.5625, -46.6558],
        [-23.5632, -46.6552],
      ],
      actualMetrics: { durationSeconds: 3600, distanceMeters: 4200, pathPointCount: 4 },
      patrolCompliance: {
        version: 1,
        coveragePercent: 87,
        checkpointsTotal: 12,
        checkpointsCovered: 10,
        maxDeviationM: 62,
        samplesUsed: 28,
        samplesDiscardedAccuracy: 2,
        referenceLengthM: 2100,
        trajectoryLengthM: 1950,
        trajectoryOnRouteM: 1680,
        toleranceM: 100,
        referenceFingerprint: 'r1_demo',
      },
    }),
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
    html += `<div style="font-size:9px;color:${th.colorMutedLight};margin-top:8px">Percurso: ${o.traversedPath.length} pontos registrados</div>`;
  }
  if (o.action === 'CHEGADA' && o.patrolCompliance && typeof o.patrolCompliance === 'object') {
    const pc = o.patrolCompliance;
    html += `<div style="margin-top:10px;padding:8px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:9px;line-height:1.5;color:#7c2d12">`;
    html += `<strong>Patrulha de rota:</strong> cobertura ${esc(String(pc.coveragePercent ?? '—'))}% · desvio máx. ${esc(String(pc.maxDeviationM ?? '—'))} m (tol. ${esc(String(pc.toleranceM ?? '—'))} m)`;
    html += `</div>`;
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

function normalizeSignatureSummaryPdfIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x || '').trim()).filter(Boolean);
}

/**
 * Resumo só leitura + assinatura (campo `signature_summary`).
 * @param {any} val
 * @param {any} f
 * @param {ReturnType<mergeTheme>} th
 * @param {Record<string, unknown>} responses
 * @param {object|null|undefined} row
 * @param {Array<{id:string,label?:string,type?:string}>} schemaFields
 */
function formatSignatureSummaryPdfBlock(val, f, th, responses, row, schemaFields) {
  const ids = normalizeSignatureSummaryPdfIds(f.summarySourceFieldIds);
  const byId = new Map((schemaFields || []).map((x) => [x.id, x]));
  const parts = [];
  parts.push(
    `<div style="margin-bottom:12px;padding:12px;border:1px solid ${th.colorBorder};border-radius:10px;background:${th.colorSurface}">`,
    `<div style="font-size:9px;font-weight:900;color:${th.colorMuted};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Resumo para assinatura</div>`,
  );
  if (!ids.length) {
    parts.push(
      `<div style="font-size:11px;color:${th.colorMutedLight};font-style:italic">Nenhum campo selecionado no modelo.</div>`,
    );
  } else {
    for (const sid of ids) {
      const sf = byId.get(sid);
      const srcVal = row && typeof row === 'object' ? row[sid] : responses[sid];
      const lab = esc(sf?.label || sid);
      let inner;
      const special = sf ? formatSpecialFieldHtml(srcVal, sf, th, responses, row) : null;
      if (special != null) {
        inner = special;
      } else if (srcVal === undefined || srcVal === null || srcVal === '') {
        inner = `<span style="color:${th.colorMutedLight};font-style:italic">Não preenchido</span>`;
      } else if (typeof srcVal === 'boolean') {
        inner = srcVal
          ? `<span class="pdf-pill" style="background:${th.pillYesBg}">Sim</span>`
          : `<span class="pdf-pill" style="background:${th.pillNoBg}">Não</span>`;
      } else if (typeof srcVal === 'object') {
        inner = `<pre style="margin:0;font-size:9px;font-family:ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;color:${th.colorMuted};line-height:1.35">${esc(JSON.stringify(srcVal))}</pre>`;
      } else {
        inner = `<span>${esc(String(srcVal))}</span>`;
      }
      parts.push(
        `<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px dashed ${th.colorBorder}">`,
        `<div style="font-size:10px;font-weight:800;color:${th.colorText};margin-bottom:4px">${lab}</div>`,
        `<div style="font-size:11px;color:${th.colorText};line-height:1.45">${inner}</div>`,
        `</div>`,
      );
    }
  }
  parts.push('</div>');
  let sigPart;
  if (typeof val === 'string' && val.startsWith('SIG_V1|')) {
    sigPart = formatSignaturePdfHtml(val, th);
  } else {
    sigPart = `<span style="color:${th.colorMutedLight};font-style:italic">Assinatura ainda não registada</span>`;
  }
  parts.push(
    `<div style="margin-top:10px;font-size:10px;font-weight:800;color:${th.colorMuted};margin-bottom:6px">Assinatura</div>`,
  );
  parts.push(`<div>${sigPart}</div>`);
  return parts.join('');
}

/** Comentários por anexo/foto (`__media_cap_<fieldId>`) — raiz ou linha repetível. */
function pdfMediaCapPreview(fieldId, index, responses, row) {
  if (!fieldId || !responses || typeof responses !== 'object') return '';
  const raw =
    row && typeof row === 'object'
      ? row['__media_cap_' + fieldId]
      : responses['__media_cap_' + fieldId];
  let cap = '';
  if (Array.isArray(raw) && raw[index] != null) cap = String(raw[index]).trim();
  else if (typeof raw === 'string' && index === 0) cap = raw.trim();
  if (!cap) return '';
  return (
    '<div style="font-size:10px;color:#422006;margin-top:8px;padding:8px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;line-height:1.45">' +
    '<strong style="color:#713f12">Comentários:</strong> ' +
    esc(cap) +
    '</div>'
  );
}

/**
 * Anexos múltiplos — espelha operations.html (file_upload).
 * @param {any} val
 * @param {{ id: string }} f
 * @param {Record<string, unknown>} responses
 */
function formatFileUploadPdfHtml(val, f, responses, row) {
  const id = f && f.id;
  if (!id) return null;
  const attachList = Array.isArray(val)
    ? val.filter((v) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('file://')))
    : typeof val === 'string' && (val.startsWith('http') || val.startsWith('file://'))
      ? [val]
      : [];
  if (attachList.length === 0) {
    return '<span style="color:#94a3b8;font-style:italic">Sem anexo enviado</span>';
  }
  return attachList
    .map((u, i) => {
      if (u.startsWith('file://')) {
        return (
          `<div style="margin-top:8px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:11px;color:#92400e;font-weight:600">${attachList.length > 1 ? 'Anexo ' + (i + 1) + ': ' : ''}Arquivo ainda no dispositivo (aguarda upload)</div>` +
          pdfMediaCapPreview(id, i, responses, row)
        );
      }
      const base = u.split('?')[0];
      let name = base.split('/').pop() || 'anexo';
      try {
        name = decodeURIComponent(name);
      } catch {
        /* keep */
      }
      const idx = attachList.length > 1 ? 'Anexo ' + (i + 1) + ' · ' : '';
      return (
        `<div style="margin-top:8px;font-size:13px;line-height:1.4"><a href="${escAttr(u)}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;font-weight:800;text-decoration:underline;word-break:break-all"><ion-icon name="document-attach-outline" style="vertical-align:-3px;font-size:17px"></ion-icon> Download — ${esc(idx)}${esc(name)}</a></div>` +
        pdfMediaCapPreview(id, i, responses, row)
      );
    })
    .join('');
}

function techCommentBlockHtml(f, responses, row) {
  if (!f || !f.id || !f.allowTechnicianComment) return '';
  const key = '__comment_' + f.id;
  const raw = String(
    (row && typeof row === 'object' ? row[key] : null) || responses[key] || '',
  ).trim();
  if (!raw) return '';
  return `<div style="margin-top:8px;padding:8px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:10px;color:#713f12;line-height:1.45"><strong>Comentário do técnico:</strong> ${esc(raw)}</div>`;
}

/** Payload do campo "custos do técnico" (`v`, `lines`, `financeAppliedRev`). */
function formatTechnicianFinancePdfHtml(val, th) {
  const fo = tryParseObject(val);
  if (!fo) {
    if (typeof val === 'string' && val.trim()) {
      return `<span style="color:${th.colorMutedLight};font-style:italic">${esc(val)}</span>`;
    }
    return `<span style="color:${th.colorMutedLight};font-style:italic">Sem lançamentos</span>`;
  }
  const flines = Array.isArray(fo.lines) ? fo.lines : [];
  const rowsFin = flines
    .map((ln) => {
      const amt = Math.max(0, Number(ln && ln.amount) || 0);
      if (amt <= 0) return '';
      const kind = ln && ln.kind === 'revenue' ? 'Receita' : 'Despesa';
      const desc = ln && ln.description != null ? String(ln.description) : '—';
      const amtStr = amt.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
      });
      return (
        `<tr><td style="padding:6px 10px;border-bottom:1px solid ${th.colorBorder};font-weight:800">` +
        esc(kind) +
        `</td><td style="padding:6px 10px;border-bottom:1px solid ${th.colorBorder};text-align:right;white-space:nowrap">` +
        esc(amtStr) +
        `</td><td style="padding:6px 10px;border-bottom:1px solid ${th.colorBorder}">` +
        esc(desc) +
        '</td></tr>'
      );
    })
    .join('');
  if (!rowsFin) {
    return `<span style="color:${th.colorMutedLight};font-style:italic">Sem lançamentos</span>`;
  }
  return (
    `<div style="overflow-x:auto;margin-top:4px">` +
    `<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid ${th.colorBorder};border-radius:8px;overflow:hidden">` +
    `<thead><tr style="background:${th.colorSurface}">` +
    `<th style="text-align:left;padding:8px 10px;font-weight:800">Tipo</th>` +
    `<th style="text-align:right;padding:8px 10px;font-weight:800">Valor</th>` +
    `<th style="text-align:left;padding:8px 10px;font-weight:800">Descrição</th>` +
    `</tr></thead><tbody>` +
    rowsFin +
    `</tbody></table></div>`
  );
}

/** Detecta payload «custos do técnico» quando `field.type` veio errado (ex.: `text`). */
function looksLikeTechnicianFinancePayload(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o) || !Array.isArray(o.lines)) return false;
  if (o.lines.length === 0) {
    return o.financeAppliedRev != null || Number(o.v) === 1;
  }
  const sample = o.lines.find((ln) => ln && typeof ln === 'object');
  if (!sample) return o.financeAppliedRev != null || Number(o.v) === 1;
  if (sample.sku !== undefined && sample.qty !== undefined && sample.amount === undefined) return false;
  return (
    sample.kind === 'expense' ||
    sample.kind === 'revenue' ||
    (typeof sample.entryId === 'string' && sample.entryId.startsWith('tech_fin_')) ||
    (Number(sample.amount) > 0 &&
      sample.description != null &&
      sample.name === undefined &&
      sample.sku === undefined)
  );
}

/**
 * HTML rico para tipos especiais; `null` → usar ramo genérico.
 * @param {any} val
 * @param {{ id: string, label?: string, type?: string, allowTechnicianComment?: boolean }} f
 * @param {ReturnType<mergeTheme>} th
 * @param {Record<string, unknown>} responses
 * @param {object|null|undefined} row — linha de seção repetível
 */
function formatSpecialFieldHtml(val, f, th, responses, row) {
  if (val === undefined || val === null || val === '') return null;

  const fType = String(f && f.type != null ? f.type : '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
  if (fType === 'technician_finance') {
    return formatTechnicianFinancePdfHtml(val, th);
  }

  if (f.type === 'file_upload') {
    return formatFileUploadPdfHtml(val, f, responses, row);
  }

  if (typeof val === 'string' && val.startsWith('SIG_V1|')) {
    return formatSignaturePdfHtml(val, th);
  }

  const asObj = tryParseObject(val);
  if (asObj && isTransitPayload(asObj)) {
    return formatTransitPayloadHtml(asObj, th);
  }

  if (fType === 'vision_checklist' || fType === 'vision_ai_analysis') {
    const vh = buildVisionChecklistReportHtml(val, fType, esc);
    if (vh) return vh;
  }

  if (asObj && typeof asObj === 'object' && !Array.isArray(asObj) && !isTransitPayload(asObj)) {
    const loc = formatLocationPickHtml(asObj, th);
    if (loc) return loc;
  }

  if (asObj && looksLikeTechnicianFinancePayload(asObj)) {
    return formatTechnicianFinancePdfHtml(val, th);
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
      plannedFoot = 'ETA da OS (sem registro detalhado na saída)';
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

    const actualDistHint = tm.actualDistFromPolyline ? 'trajeto GPS' : 'aprox. (reta ou registro)';
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

function normalizePolygonVertexPdf(pt) {
  if (!pt) return null;
  if (Array.isArray(pt) && pt.length >= 2) {
    let la = Number(pt[0]);
    let ln = Number(pt[1]);
    // GeoJSON / KML export [lng,lat] — heurística BR (igual à app)
    const firstLooksLng = la <= -20 && la >= -80;
    const secondLooksLat = ln >= -35 && ln <= 15;
    if (firstLooksLng && secondLooksLat) {
      const t = la;
      la = ln;
      ln = t;
    }
    if (Number.isFinite(la) && Number.isFinite(ln)) return [la, ln];
  }
  if (typeof pt === 'object') {
    const la = Number(pt.lat ?? pt.latitude);
    const ln = Number(pt.lng ?? pt.lon ?? pt.longitude);
    if (Number.isFinite(la) && Number.isFinite(ln)) return [la, ln];
  }
  return null;
}

function parseTaskRoutePolygonForPdf(t) {
  const raw = t?.locationPolygon;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(normalizePolygonVertexPdf).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j.map(normalizePolygonVertexPdf).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Reúne coordenadas [lat,lng] da referência e da trilha GPS. */
function collectPatrolFlatCoords(refLatLng, traversedLatLng) {
  const flat = [];
  const pushArr = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((c) => {
      if (Array.isArray(c) && c.length >= 2) {
        const la = Number(c[0]);
        const ln = Number(c[1]);
        if (Number.isFinite(la) && Number.isFinite(ln)) flat.push([la, ln]);
      } else if (c && typeof c === 'object') {
        const la = Number(c.lat ?? c.latitude);
        const ln = Number(c.lng ?? c.lon ?? c.longitude);
        if (Number.isFinite(la) && Number.isFinite(ln)) flat.push([la, ln]);
      }
    });
  };
  pushArr(refLatLng);
  const tr = normalizeTraversedPathForReport(traversedLatLng);
  if (tr) tr.forEach((p) => flat.push(p));
  return flat;
}

function bboxFromLatLngListPdf(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const c of arr) {
    let la;
    let ln;
    if (Array.isArray(c) && c.length >= 2) {
      la = Number(c[0]);
      ln = Number(c[1]);
    } else if (c && typeof c === 'object') {
      la = Number(c.lat ?? c.latitude);
      ln = Number(c.lng ?? c.lon ?? c.longitude);
    } else continue;
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln);
    maxLng = Math.max(maxLng, ln);
  }
  if (!Number.isFinite(minLat)) return null;
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    dlat: maxLat - minLat,
    dlng: maxLng - minLng,
  };
}

function unionBboxPdf(a, b) {
  const minLat = Math.min(a.minLat, b.minLat);
  const maxLat = Math.max(a.maxLat, b.maxLat);
  const minLng = Math.min(a.minLng, b.minLng);
  const maxLng = Math.max(a.maxLng, b.maxLng);
  return { minLat, maxLat, minLng, maxLng, dlat: maxLat - minLat, dlng: maxLng - minLng };
}

/**
 * Centro e extensão para o mapa 3×3: prioriza a trilha GPS. Se a referência for muito mais
 * extensa que a trilha (ex.: polilinha de despacho com trechos longínquos), o zoom não fica
 * destruído pela referência — alinhado ao que o técnico efetivamente percorreu.
 */
function patrolRasterFitBounds(refLatLng, traversedLatLng) {
  const tr = normalizeTraversedPathForReport(traversedLatLng);
  const trB = tr && tr.length >= 2 ? bboxFromLatLngListPdf(tr) : null;
  const refB =
    Array.isArray(refLatLng) && refLatLng.length >= 1 ? bboxFromLatLngListPdf(refLatLng) : null;

  let b = null;
  if (trB) {
    const trSpan = Math.max(trB.dlat, trB.dlng);
    const refSpan = refB ? Math.max(refB.dlat, refB.dlng) : 0;
    if (refB && refSpan > trSpan * 4) {
      b = trB;
    } else if (refB) {
      b = unionBboxPdf(trB, refB);
    } else {
      b = trB;
    }
  } else if (refB && refLatLng.length >= 2) {
    b = refB;
  } else {
    const flat = collectPatrolFlatCoords(refLatLng, traversedLatLng);
    if (flat.length === 0) return null;
    b = bboxFromLatLngListPdf(flat);
  }
  if (!b) return null;

  const pad = 1.24;
  const clat = (b.minLat + b.maxLat) / 2;
  const clng = (b.minLng + b.maxLng) / 2;
  let dlat = (b.maxLat - b.minLat) * pad;
  let dlng = (b.maxLng - b.minLng) * pad;
  const minSpan = 0.00032;
  dlat = Math.max(dlat, minSpan);
  dlng = Math.max(dlng, minSpan);
  return { clat, clng, dlat, dlng };
}

function pickPatrolOsmZoom(dlat, dlng) {
  const d = Math.max(dlat > 0 ? dlat : 0.00025, dlng > 0 ? dlng : 0.00025);
  let z;
  if (d > 1.5) z = 9;
  else if (d > 0.55) z = 10;
  else if (d > 0.22) z = 11;
  else if (d > 0.09) z = 12;
  else if (d > 0.035) z = 13;
  else if (d > 0.012) z = 14;
  else if (d > 0.004) z = 15;
  else z = 16;
  return Math.min(18, z);
}

/** Tile XYZ (Slippy Map) — mesmos tiles que o site OSM. */
function lngLatToOsmTile(lng, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y, n };
}

function osmTileYToLatNorthEdge(ty, z) {
  const n = 2 ** z;
  const rad = Math.PI * (1 - (2 * ty) / n);
  return (180 / Math.PI) * Math.atan(Math.sinh(rad));
}

function patrolDisplayedTileBounds(cx, cy, z) {
  const n = 2 ** z;
  const txs = [cx - 1, cx, cx + 1].map((t) => Math.max(0, Math.min(n - 1, t)));
  const tys = [cy - 1, cy, cy + 1].map((t) => Math.max(0, Math.min(n - 1, t)));
  const minTx = Math.min(...txs);
  const maxTx = Math.max(...txs);
  const minTy = Math.min(...tys);
  const maxTy = Math.max(...tys);
  return {
    west: (minTx / n) * 360 - 180,
    east: ((maxTx + 1) / n) * 360 - 180,
    north: osmTileYToLatNorthEdge(minTy, z),
    south: osmTileYToLatNorthEdge(maxTy + 1, z),
  };
}

function mercYFromLat(lat) {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function lngLatToSvgPercentFromBounds(lng, lat, b) {
  const du = b.east - b.west;
  if (!(du > 0)) return null;
  const mercN = mercYFromLat(b.north);
  const mercS = mercYFromLat(b.south);
  const dv = mercN - mercS;
  if (Math.abs(dv) < 1e-14) return null;
  const merc = mercYFromLat(lat);
  const u = ((lng - b.west) / du) * 100;
  const v = ((mercN - merc) / dv) * 100;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return { u, v };
}

function coordsToSvgPolyline(coords, b) {
  if (!Array.isArray(coords)) return '';
  const parts = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const la = Number(c[0]);
    const ln = Number(c[1]);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    const p = lngLatToSvgPercentFromBounds(ln, la, b);
    if (!p) continue;
    parts.push(`${p.u.toFixed(2)},${p.v.toFixed(2)}`);
  }
  if (parts.length < 2) return '';
  return parts.join(' ');
}

function buildPatrolSvgOverlay(refLatLng, traversedLatLng, cx, cy, z, zoneType) {
  const b = patrolDisplayedTileBounds(cx, cy, z);
  const zt = String(zoneType || 'route').toLowerCase();
  let refSvg = '';
  if (zt === 'polygon' && Array.isArray(refLatLng) && refLatLng.length >= 3) {
    const polyPts = coordsToSvgPolyline(refLatLng, b);
    if (polyPts) {
      refSvg = `<polygon fill="rgba(59,130,246,0.2)" stroke="#2563eb" stroke-width="0.55" stroke-linejoin="round" points="${polyPts}"/>`;
    }
  } else {
    const refLine = coordsToSvgPolyline(refLatLng, b);
    if (refLine) {
      const stroke = zt === 'segment' ? '#9333ea' : '#ea580c';
      refSvg = `<polyline fill="none" stroke="${stroke}" stroke-width="0.65" stroke-linecap="round" stroke-linejoin="round" points="${refLine}"/>`;
    }
  }
  const trLine = coordsToSvgPolyline(traversedLatLng, b);
  let markers = '';
  if (Array.isArray(traversedLatLng) && traversedLatLng.length >= 1) {
    const s = traversedLatLng[0];
    const e = traversedLatLng[traversedLatLng.length - 1];
    const ps = lngLatToSvgPercentFromBounds(Number(s[1]), Number(s[0]), b);
    const pe = lngLatToSvgPercentFromBounds(Number(e[1]), Number(e[0]), b);
    if (ps) {
      markers += `<g transform="translate(${ps.u.toFixed(3)},${ps.v.toFixed(3)})"><circle cx="0" cy="0" r="2.35" fill="#ffffff" stroke="#16a34a" stroke-width="0.5"/><path d="M -0.9 -1.05 L -0.9 1.05 L 1.2 0 Z" fill="#16a34a"/></g>`;
    }
    if (pe && traversedLatLng.length > 1) {
      markers += `<g transform="translate(${pe.u.toFixed(3)},${pe.v.toFixed(3)})"><circle cx="0" cy="0" r="2.35" fill="#ffffff" stroke="#dc2626" stroke-width="0.5"/><rect x="-0.95" y="-0.95" width="1.9" height="1.9" rx="0.28" fill="#dc2626"/></g>`;
    }
  }
  if (!refSvg && !trLine && !markers) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none" aria-hidden="true">${refSvg}${
    trLine
      ? `<polyline fill="none" stroke="#2563eb" stroke-width="0.55" stroke-linecap="round" stroke-linejoin="round" points="${trLine}"/>`
      : ''
  }${markers}</svg>`;
}

/**
 * Mapa raster 3×3 com tiles oficiais + SVG (rota / GPS) alinhado a Web Mercator.
 * Política OSM: uso moderado; © na legenda.
 */
function buildPatrolOsmRasterMapHtml(th, refLatLng, traversedLatLng, zoneType) {
  const fit = patrolRasterFitBounds(refLatLng, traversedLatLng);
  if (!fit) return null;
  const { clat, clng, dlat, dlng } = fit;
  const z = pickPatrolOsmZoom(dlat, dlng);
  const { x: cx, y: cy, n } = lngLatToOsmTile(clng, clat, z);
  const imgs = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = Math.max(0, Math.min(n - 1, cx + dx));
      const ty = Math.max(0, Math.min(n - 1, cy + dy));
      const src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
      imgs.push(
        `<img loading="eager" decoding="async" src="${escUrlAttr(src)}" alt="" width="256" height="256" style="width:33.333333%;height:auto;display:block;margin:0;padding:0;border:0;vertical-align:top;box-sizing:border-box" />`,
      );
    }
  }
  const zt = String(zoneType || 'route').toLowerCase();
  const overlay = buildPatrolSvgOverlay(refLatLng, traversedLatLng, cx, cy, z, zt);
  const legend =
    zt === 'polygon'
      ? `Polígono azul: área de serviço (KML) · Linha azul escura: trilha GPS · ▶ início · ■ fim. Cartografia: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:700">© OpenStreetMap contributors</a>.`
      : zt === 'segment'
        ? `Roxo: trecho A–B (referência KML) · Azul: trilha GPS · ▶ início · ■ fim. Cartografia: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:700">© OpenStreetMap contributors</a>.`
        : `Laranja: rota de referência (KML) · Azul: trilha GPS · ▶ início · ■ fim. Cartografia: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:700">© OpenStreetMap contributors</a>.`;
  return `
    <div style="position:relative;width:100%;border-bottom:1px solid ${th.colorBorder};background:#d9dde0;overflow:hidden">
      <div style="display:flex;flex-wrap:wrap;width:100%;line-height:0;font-size:0">${imgs.join('')}</div>
      ${overlay}
    </div>
    <div style="font-size:8px;color:${th.colorMuted};padding:6px 10px;background:#f1f5f9;line-height:1.4">
      ${legend}
    </div>`;
}

/** Abre OSM em novo separador (zoom centrado no mesmo enquadramento lógico do raster). */
function buildOsmPatrolBrowseUrl(refLatLng, traversedLatLng) {
  const fit = patrolRasterFitBounds(refLatLng, traversedLatLng);
  if (!fit) return null;
  const z = Math.min(19, pickPatrolOsmZoom(fit.dlat, fit.dlng) + 1);
  return `https://www.openstreetmap.org/#map=${z}/${fit.clat.toFixed(6)}/${fit.clng.toFixed(6)}`;
}

function escUrlAttr(url) {
  return String(url || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function fmtPatrolDistanceMetersPdf(m) {
  if (m === null || m === undefined) return '—';
  const n = Number(m);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} km (${Math.round(n)} m)`;
  return `${Math.round(n)} m`;
}

function haversineMetersPatrolPdf(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const a1 = Number(lat1);
  const o1 = Number(lng1);
  const a2 = Number(lat2);
  const o2 = Number(lng2);
  if (![a1, o1, a2, o2].every((x) => Number.isFinite(x))) return 0;
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function projectPointOnPolylinePatrolPdf(lat, lng, ref) {
  if (!ref || ref.length < 2) return { distM: Infinity };
  let minDist = Infinity;
  for (let i = 0; i < ref.length - 1; i++) {
    const aL = Number(ref[i][0]);
    const aG = Number(ref[i][1]);
    const bL = Number(ref[i + 1][0]);
    const bG = Number(ref[i + 1][1]);
    if (![aL, aG, bL, bG].every((x) => Number.isFinite(x))) continue;
    const dx = bG - aG;
    const dy = bL - aL;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((lng - aG) * dx + (lat - aL) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const pL = aL + t * dy;
    const pG = aG + t * dx;
    const d = haversineMetersPatrolPdf(lat, lng, pL, pG);
    if (d < minDist) minDist = d;
  }
  return { distM: minDist };
}

/** Igual à app: soma segmentos da trilha cujo ponto médio está ≤ tolerância da referência. */
function computeTrajectoryOnRouteMetersPatrolPdf(refLatLng, trLatLng, toleranceM) {
  const tol = Math.max(5, Number(toleranceM) || 100);
  const ref = (refLatLng || []).filter(
    (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1]),
  );
  if (ref.length < 2 || !Array.isArray(trLatLng) || trLatLng.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < trLatLng.length; i++) {
    const a = trLatLng[i - 1];
    const b = trLatLng[i];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const la0 = Number(a[0]);
    const ln0 = Number(a[1]);
    const la1 = Number(b[0]);
    const ln1 = Number(b[1]);
    if (![la0, ln0, la1, ln1].every((x) => Number.isFinite(x))) continue;
    const midLat = (la0 + la1) / 2;
    const midLng = (ln0 + ln1) / 2;
    const dm = projectPointOnPolylinePatrolPdf(midLat, midLng, ref).distM;
    if (Number.isFinite(dm) && dm <= tol) {
      sum += haversineMetersPatrolPdf(la0, ln0, la1, ln1);
    }
  }
  return Math.round(sum);
}

function polylineLengthTraversedPdf(tr) {
  if (!Array.isArray(tr) || tr.length < 2) return null;
  let sum = 0;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1];
    const b = tr[i];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const la = Number(a[0]);
    const ln = Number(a[1]);
    const la2 = Number(b[0]);
    const ln2 = Number(b[1]);
    if (![la, ln, la2, ln2].every((x) => Number.isFinite(x))) continue;
    const dLat = toRad(la2 - la);
    const dLng = toRad(ln2 - ln);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(la)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
    sum += R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return sum > 0 ? sum : null;
}

/**
 * Mapa raster + geometria de despacho (rota, polígono ou trecho KML) e trilha GPS no PDF.
 * Métricas de patrulha (corredor) só para `locationZoneType === 'route'`.
 */
function buildPatrolRoutePdfBlockPreview(th, task, endGPS) {
  if (!task) return '';
  const zt = String(task.locationZoneType || '').toLowerCase();
  if (zt !== 'route' && zt !== 'polygon' && zt !== 'segment') return '';
  const ref = parseTaskRoutePolygonForPdf(task);
  const minRef = zt === 'polygon' ? 3 : 2;
  const tr = endGPS ? normalizeTraversedPathForReport(endGPS.traversedPath) || [] : [];
  if (!endGPS && ref.length < minRef) return '';
  const refTooShort = ref.length < minRef;
  const p =
    zt === 'route' &&
    endGPS &&
    endGPS.patrolCompliance &&
    typeof endGPS.patrolCompliance === 'object'
      ? endGPS.patrolCompliance
      : null;
  const browseOsmUrl = buildOsmPatrolBrowseUrl(ref, tr);
  const rasterMapInner = buildPatrolOsmRasterMapHtml(th, ref, tr, zt);
  const hrefAttr = (u) => String(u || '').replace(/"/g, '&quot;');
  const tol =
    task.locationRadius != null
      ? String(task.locationRadius)
      : p && p.toleranceM != null
        ? String(p.toleranceM)
        : '—';
  const ok =
    p && p.maxDeviationM != null && Number(p.toleranceM) > 0
      ? Number(p.maxDeviationM) <= Number(p.toleranceM)
      : null;
  const badge =
    ok === true
      ? `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:9px;font-weight:800;background:#dcfce7;color:#166534">Dentro do corredor (pior desvio ≤ tolerância)</span>`
      : ok === false
        ? `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:9px;font-weight:800;background:#fee2e2;color:#991b1b">Desvio máximo acima da tolerância</span>`
        : '';
  const title =
    zt === 'polygon'
      ? 'ZONA POLIGONAL (KML / mapa de serviço)'
      : zt === 'segment'
        ? 'TRECHO DE REFERÊNCIA (KML)'
        : p != null
          ? 'PATRULHA DE ROTA (certificação)'
          : 'PATRULHA DE ROTA (evidência)';
  let metricsBlock = '';
  if (p) {
    const tolNum = Math.max(5, Number(p.toleranceM) || Number(task.locationRadius) || 100);
    let onRouteMeters = p.trajectoryOnRouteM;
    if (onRouteMeters === null || onRouteMeters === undefined || !Number.isFinite(Number(onRouteMeters))) {
      onRouteMeters = computeTrajectoryOnRouteMetersPatrolPdf(ref, tr, tolNum);
    } else {
      onRouteMeters = Number(onRouteMeters);
    }
    const dTraj = esc(fmtPatrolDistanceMetersPdf(p.trajectoryLengthM));
    const dOn = esc(fmtPatrolDistanceMetersPdf(onRouteMeters));
    const dRef = esc(fmtPatrolDistanceMetersPdf(p.referenceLengthM));
    metricsBlock = `
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;font-size:10px;color:${th.colorText}">
        <div style="background:#fff;padding:8px;border-radius:8px;border:1px solid ${th.colorBorder}"><div style="font-size:7px;color:${th.colorMuted};font-weight:800;text-transform:uppercase">Cobertura</div><div style="font-weight:900;font-size:14px;margin-top:2px">${esc(String(p.coveragePercent ?? '—'))}%</div></div>
        <div style="background:#fff;padding:8px;border-radius:8px;border:1px solid ${th.colorBorder}"><div style="font-size:7px;color:${th.colorMuted};font-weight:800;text-transform:uppercase">Desvio máx.</div><div style="font-weight:900;font-size:14px;margin-top:2px">${esc(String(p.maxDeviationM ?? '—'))} m</div></div>
        <div style="background:#fff;padding:8px;border-radius:8px;border:1px solid ${th.colorBorder}"><div style="font-size:7px;color:${th.colorMuted};font-weight:800;text-transform:uppercase">Tolerância</div><div style="font-weight:900;font-size:14px;margin-top:2px">${esc(tol)} m</div></div>
      </div>
      <div style="margin-top:6px;font-size:7px;color:${th.colorMuted};line-height:1.35;font-style:italic">Cobertura: % de pontos de controle ao longo da referência com amostra GPS no corredor — não corresponde a "distância no corredor ÷ referência".</div>
      <div style="margin-top:10px;padding:10px 12px;background:#fffbea;border:1px solid #fde68a;border-radius:8px">
        <div style="font-size:9px;font-weight:900;color:#9a3412;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Resumo do percurso</div>
        <table style="width:100%;font-size:10px;color:${th.colorText};line-height:1.5;border-collapse:collapse">
          <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:${th.colorMuted}">Distância percorrida <span style="font-size:8px">(trilha GPS, amostras válidas na app)</span></td><td style="padding:4px 0;font-weight:800;white-space:nowrap;text-align:right">${dTraj}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:${th.colorMuted}">Distância no corredor <span style="font-size:8px">(soma de segmentos cujo ponto médio está ≤ tolerância; se faltar no registro, recalculado a partir da trilha do PDF)</span></td><td style="padding:4px 0;font-weight:800;white-space:nowrap;text-align:right">${dOn}</td></tr>
          <tr><td style="padding:4px 8px 4px 0;vertical-align:top;color:${th.colorMuted}">Comprimento da rota de referência</td><td style="padding:4px 0;font-weight:800;white-space:nowrap;text-align:right">${dRef}</td></tr>
        </table>
        <div style="margin-top:8px;font-size:8px;color:${th.colorMuted};line-height:1.4;border-top:1px solid ${th.colorBorder};padding-top:8px">
          Pontos GPS válidos: ${esc(String(p.samplesUsed ?? '—'))}${p.samplesDiscardedAccuracy > 0 ? esc(` · Descartados (precisão): ${p.samplesDiscardedAccuracy}`) : ''}
        </div>
      </div>`;
  } else {
    const refHint = refTooShort
      ? zt === 'polygon'
        ? 'O polígono de despacho tem menos de três pontos válidos — não foi possível desenhar a área de referência no mapa.'
        : zt === 'segment'
          ? 'O trecho de despacho precisa de dois pontos (A e B) para aparecer no mapa.'
          : 'A polilinha de despacho tem menos de dois pontos, por isso não foi possível calcular cobertura/desvio nem gerar o mapa de referência.'
      : zt === 'polygon' || zt === 'segment'
        ? 'Geometria de despacho (KML) abaixo; a linha azul é a trilha GPS do deslocamento, quando registada.'
        : 'Não há métricas de patrulha neste registro (poucas amostras de GPS no deslocamento, interrupção do rastreamento ou versão anterior do app). O mapa abaixo mostra ainda assim o trajeto planejado e a trilha registrada, se existirem.';
    const estLen = polylineLengthTraversedPdf(tr);
    const extraEst =
      estLen != null
        ? `<div style="margin-top:8px;font-size:10px;color:${th.colorText};line-height:1.45"><strong>Distância percorrida (estimada, só pela trilha):</strong> ${esc(fmtPatrolDistanceMetersPdf(estLen))}</div>`
        : '';
    metricsBlock = `<div style="margin-bottom:8px;font-size:10px;color:${th.colorText};line-height:1.5;padding:10px 12px;background:#fff;border-radius:8px;border:1px solid ${th.colorBorder}">${esc(refHint)}</div>${extraEst}`;
  }
  let mapBlock = '';
  const osmLinkRow = browseOsmUrl
    ? `<div style="font-size:9px;padding:8px 10px;background:#f1f5f9;border-bottom:1px solid ${th.colorBorder}"><a href="${hrefAttr(browseOsmUrl)}" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:800">Abrir em tela cheia (OpenStreetMap)</a></div>`
    : '';
  if (rasterMapInner) {
    mapBlock = `<div style="margin-top:10px;border-radius:10px;overflow:hidden;border:1px solid ${th.colorBorder};background:#e2e8f0">
      ${osmLinkRow}
      ${rasterMapInner}
      <div style="font-size:8px;color:${th.colorMuted};padding:8px 10px;border-top:1px solid ${th.colorBorder};background:#fff;line-height:1.45">Para zoom e detalhe, use "Abrir em tela cheia". Legenda: ${
        zt === 'polygon'
          ? 'polígono de serviço (KML) e trilha GPS sobre os tiles OSM.'
          : zt === 'segment'
            ? 'trecho A–B (KML), trilha GPS e início/fim sobre os tiles OSM.'
            : 'rota de referência (laranja), trilha GPS (azul) e início/fim sobre os tiles OSM.'
      }</div>
    </div>`;
  } else if (!p) {
    mapBlock =
      refTooShort && (!tr || tr.length < 1)
        ? `<div style="margin-top:8px;font-size:9px;color:${th.colorMuted};line-height:1.45">Sem coordenadas para mapa: confira o polígono/rota no despacho ou registe o fim de deslocamento com trilha GPS.</div>`
        : browseOsmUrl
          ? `<div style="margin-top:8px;font-size:9px;color:${th.colorMuted};line-height:1.45"><a href="${hrefAttr(browseOsmUrl)}" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:700">Abrir no OpenStreetMap</a></div>`
          : '';
  } else if (p && browseOsmUrl) {
    mapBlock = `<div style="margin-top:10px;padding:12px;border:1px solid ${th.colorBorder};border-radius:8px;background:#f8fafc;font-size:10px;color:${th.colorMuted}">Sem coordenadas para gerar o mapa raster. <a href="${hrefAttr(browseOsmUrl)}" target="_blank" rel="noopener noreferrer" style="color:${th.colorAccent};font-weight:800">Ver no OpenStreetMap</a></div>`;
  }
  return `
    <div style="margin-top:14px;padding:12px 14px;border:1px solid #fed7aa;border-radius:10px;background:linear-gradient(135deg,#fff7ed 0%,#fff 100%);box-sizing:border-box">
      <div style="font-size:11px;font-weight:900;color:#9a3412;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <ion-icon name="git-network-outline" style="font-size:18px;color:#ea580c"></ion-icon>
        ${esc(title)}
        ${badge}
      </div>
      ${metricsBlock}
      ${mapBlock}
    </div>`;
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
  const prodSnap = resolveProductivityFromTask(t);
  const plannedFormMinPdf = prodSnap.plannedFormDurationMinutes;
  const schedStartPdf = t.scheduledStartAt;
  const efMinPdf = t.expectedFormDurationMinutes;
  let agendaWindowLinePdf = '';
  if (
    schedStartPdf &&
    efMinPdf != null &&
    Number.isFinite(Number(efMinPdf)) &&
    Number(efMinPdf) > 0
  ) {
    const startMs = new Date(schedStartPdf).getTime();
    const endMs = startMs + Math.floor(Number(efMinPdf)) * 60000;
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      const sStr = formatPtDateTimeDotPdf(new Date(startMs).toISOString());
      const eStr = formatPtDateTimeDotPdf(new Date(endMs).toISOString());
      agendaWindowLinePdf = `<div style="font-size:9px;color:#334155;padding:8px 12px 0;font-weight:700;border-top:1px dashed ${th.colorBorder}">Janela prevista (formulário, sem deslocamento): ${esc(sStr)} → ${esc(eStr)}</div>`;
    }
  }
  const formPrevVsRealLine =
    plannedFormMinPdf != null && Number.isFinite(Number(plannedFormMinPdf))
      ? `<div style="font-size:9px;color:#475569;padding:8px 12px 0;font-weight:600">Meta de preenchimento (min): <strong>${esc(
          String(Math.floor(Number(plannedFormMinPdf))),
        )}</strong> · tempo real de preenchimento <strong>${esc(formFillStrPdf)}</strong>${
          prodSnap.pctFormFillVsPlanned != null && Number.isFinite(Number(prodSnap.pctFormFillVsPlanned))
            ? ` · ${Number(prodSnap.pctFormFillVsPlanned) > 0 ? '+' : ''}${esc(
                String(prodSnap.pctFormFillVsPlanned),
              )}% vs meta`
            : ''
        }.</div>`
      : '';

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
            ${agendaWindowLinePdf}
            ${formPrevVsRealLine}
          </div>
          <div style="padding:10px 12px 12px;background:#fff;">
            <div style="padding:10px 12px;background:#FFF7ED;border:1px solid #FFEDD5;border-radius:8px;box-sizing:border-box">
              <div style="font-size:8px;font-weight:900;color:#9A3412;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:5px">
                <ion-icon name="git-branch-outline" style="font-size:14px;color:${th.transitAccent}"></ion-icon> Etapas no formulário
              </div>
              <div style="font-size:8px;color:#78350f;line-height:1.45;font-weight:600">${sectionLineProd || '<span style="color:#ca8a04;font-weight:500">Sem tempos por etapa registrados.</span>'}</div>
            </div>
            ${pdfPauseInProdHtml}
          </div>
        </div>
      </div>`;
}

/** Data/hora da captura embutida na query (`capturedAt`), igual ao app. */
function parseCapturedAtFromPhotoUri(uri) {
  try {
    const s = String(uri);
    const q = s.indexOf('?');
    if (q === -1) return null;
    const cap = new URLSearchParams(s.slice(q)).get('capturedAt');
    if (!cap) return null;
    const d = new Date(decodeURIComponent(cap));
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('pt-BR');
  } catch {
    return null;
  }
}

function formatFieldTimeIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR');
}

function safeDecodeUriComponentPdf(v) {
  try {
    return decodeURIComponent(String(v).replace(/\+/g, ' '));
  } catch {
    return String(v ?? '');
  }
}

function parseFacialUriQueryPdf(uri) {
  const s = String(uri);
  const q = s.indexOf('?');
  const out = { capturedAt: '', lat: '', lng: '', addr: '' };
  if (q < 0) return out;
  try {
    const sp = new URLSearchParams(s.slice(q + 1));
    const cap = sp.get('capturedAt');
    out.capturedAt = cap ? safeDecodeUriComponentPdf(cap) : '';
    out.lat = sp.get('lat') || '';
    out.lng = sp.get('lng') || '';
    const ad = sp.get('addr');
    out.addr = ad ? safeDecodeUriComponentPdf(ad) : '';
  } catch {
    /* ignore */
  }
  return out;
}

function formatPtDateTimeDotPdf(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date} · ${time}`;
}

function parseBiometricAuditPdf(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

function resolveBiometricRawPdf(responses, row, fieldId) {
  const key = `${fieldId}__biometric`;
  if (row && typeof row === 'object' && row[key] != null) return row[key];
  return responses && typeof responses === 'object' ? responses[key] : null;
}

function formatConfidencePctPdf(c) {
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  const pct = c <= 1 ? Math.round(c * 100) : Math.round(Math.min(100, c));
  return `${pct}%`;
}

function schemaFieldRequiresOnlineValidationPdf(field) {
  if (!field || typeof field !== 'object') return false;
  const v = field.requireOnlineValidation;
  if (v === true || v === 1) return true;
  if (v === false || v == null || v === '') return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }
  return false;
}

const FACIAL_NO_FACE_IN_IMAGE_MSG_PDF =
  'Nenhum rosto foi detectado na imagem enviada. Posicione o rosto de frente para a câmera, com boa iluminação; evite fotografar uma tela, reflexos ou imagens em papel.';

/** Mensagem legível em pt-BR para PDF (inclui auditorias antigas com texto em inglês da API). */
function humanizeFacialAuditMessageForReportPdf(audit) {
  if (!audit || typeof audit !== 'object') return '';
  if (audit.reason === 'compreface_no_face_in_image' && typeof audit.message === 'string' && audit.message.trim()) {
    return audit.message;
  }
  const code = audit.comprefaceCode;
  if (code === 28 || code === '28' || Number(code) === 28) return FACIAL_NO_FACE_IN_IMAGE_MSG_PDF;
  const m = typeof audit.message === 'string' ? audit.message : '';
  if (/no face is found in the given image/i.test(m) || /"code"\s*:\s*28\b/i.test(m)) return FACIAL_NO_FACE_IN_IMAGE_MSG_PDF;
  return m;
}

/**
 * @returns {{ kind: 'ok'|'pending'|'failed'; border: string; footer: string; title: string; message?: string }}
 */
function classifyFacialAuditForPdf(audit, field) {
  if (!audit || typeof audit !== 'object') {
    return {
      kind: 'pending',
      border: '#b45309',
      footer: '#c2410c',
      title: 'RECONHECIMENTO FACIAL — PENDENTE',
      message: '',
    };
  }
  const deferFailed = audit.deferredValidationFailed === true;
  const confStr = formatConfidencePctPdf(audit.confidence);
  const success =
    !deferFailed && !!(audit.at || audit.engine || confStr);
  const reqOnline = schemaFieldRequiresOnlineValidationPdf(field);
  const explicitPending = audit.pending === true;
  const pending = !success && !deferFailed && (!reqOnline || explicitPending);

  if (deferFailed || (!success && !pending)) {
    return {
      kind: 'failed',
      border: '#b91c1c',
      footer: '#b91c1c',
      title: 'RECONHECIMENTO FACIAL — NÃO VALIDADO',
      message: humanizeFacialAuditMessageForReportPdf(audit),
    };
  }
  if (pending) {
    return {
      kind: 'pending',
      border: '#b45309',
      footer: '#c2410c',
      title: 'RECONHECIMENTO FACIAL — PENDENTE',
      message: '',
    };
  }
  return {
    kind: 'ok',
    border: '#15803d',
    footer: '#15803d',
    title: 'RECONHECIMENTO FACIAL — VÁLIDO',
    message: '',
  };
}

function buildFacialRecognitionPdfCard(opts) {
  const { singleVal, imgInnerHtml, field, responses, row, esc: escFn, fotoIndexLabel, fieldTimeIso } = opts;
  const id = field.id;
  const audit = parseBiometricAuditPdf(resolveBiometricRawPdf(responses, row, id));
  const cls = classifyFacialAuditForPdf(audit, field);
  const qMeta = parseFacialUriQueryPdf(singleVal);
  const fromFieldTime =
    fieldTimeIso && typeof fieldTimeIso === 'string' && String(fieldTimeIso).trim()
      ? String(fieldTimeIso).trim()
      : '';
  const captureIso =
    qMeta.capturedAt ||
    (audit && typeof audit.capturedAt === 'string' ? audit.capturedAt : '') ||
    fromFieldTime ||
    '';
  const captureDisp = formatPtDateTimeDotPdf(captureIso);

  let validationLine = '';
  if (cls.kind === 'ok') {
    validationLine = audit?.at ? `Validação: ${formatPtDateTimeDotPdf(audit.at)}` : 'Validação: —';
  } else if (cls.kind === 'pending') {
    validationLine = 'Validação: pendente (assíncrona no servidor)';
  } else {
    validationLine =
      audit && audit.at ? `Validação: ${formatPtDateTimeDotPdf(audit.at)}` : 'Validação: não concluída';
  }

  const identifiedName = (audit?.identifiedUser?.name || '').trim();
  const identifiedEmail = (audit?.identifiedUser?.email || '').trim();
  const latFromQ = qMeta.lat && qMeta.lng ? String(qMeta.lat) : '';
  const lngFromQ = qMeta.lat && qMeta.lng ? String(qMeta.lng) : '';
  const latFromA = audit && audit.captureLat != null ? String(audit.captureLat) : '';
  const lngFromA = audit && audit.captureLng != null ? String(audit.captureLng) : '';
  const latUse = latFromQ || latFromA;
  const lngUse = lngFromQ || lngFromA;
  const gpsLine =
    latUse && lngUse && Number.isFinite(Number(latUse)) && Number.isFinite(Number(lngUse))
      ? `${Number(latUse).toFixed(5)}, ${Number(lngUse).toFixed(5)}`
      : '—';
  const addrRaw =
    qMeta.addr ||
    (audit && typeof audit.captureAddr === 'string' && audit.captureAddr.trim() ? audit.captureAddr.trim() : '');
  const addrLine = addrRaw ? `Endereço: ${addrRaw}` : 'Endereço: —';

  const confStr = formatConfidencePctPdf(audit?.confidence);
  const confHtml =
    cls.kind === 'ok' && confStr
      ? `<div style="font-size:9px;margin-top:5px;opacity:0.95;font-weight:600">Confiança: ${escFn(confStr)}</div>`
      : '';

  const failMsg =
    cls.kind === 'failed' && cls.message
      ? `<div style="font-size:9px;margin-top:6px;line-height:1.35;opacity:0.95">${escFn(cls.message)}</div>`
      : cls.kind === 'pending'
        ? `<div style="font-size:9px;margin-top:6px;line-height:1.35;opacity:0.95">Foto guardada. A validação biométrica conclui quando o servidor processar o envio.</div>`
        : '';

  const identityBlock =
    cls.kind === 'ok'
      ? `<div style="font-size:12px;font-weight:800;margin-top:2px;color:#fff">${escFn(identifiedName || '—')}</div>
         <div style="font-size:10px;margin-top:3px;font-weight:600;color:#fff">Login: ${escFn(identifiedEmail || '—')}</div>`
      : '';

  return `
  <div style="margin-top:10px;max-width:300px;margin-left:auto;margin-right:auto;border:8px solid ${cls.border};border-radius:12px;overflow:hidden;box-sizing:border-box;background:#0f172a">
    <div style="background:#e2e8f0;min-height:220px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:4px">
      ${imgInnerHtml}
    </div>
    <div style="background:${cls.footer};color:#fff;padding:12px 12px 14px;border-top:2px solid rgba(255,255,255,0.35);box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
      <div style="font-size:9px;font-weight:900;letter-spacing:0.5px;margin-bottom:6px;text-transform:uppercase">${escFn(cls.title)}${escFn(fotoIndexLabel)}</div>
      ${identityBlock}
      ${failMsg}
      <div style="font-size:10px;margin-top:${cls.kind === 'ok' ? 8 : 4}px;font-weight:700">Captura: ${escFn(captureDisp)}</div>
      <div style="font-size:10px;margin-top:4px;font-weight:700">${escFn(validationLine)}</div>
      <div style="font-size:9px;margin-top:5px;font-weight:600">GPS: ${escFn(gpsLine)}</div>
      <div style="font-size:9px;margin-top:3px;line-height:1.35;font-weight:600">${escFn(addrLine)}</div>
      ${confHtml}
    </div>
  </div>`;
}

/** Todas as fotos do campo + legenda `__media_cap_` por índice (como no PDF da Central). */
function renderPhotoPdfBlock(val, f, th, t, responses, row, fieldTimeIso) {
  const id = f.id;
  const urls = Array.isArray(val) ? val : val != null ? [val] : [];
  const stampTypes = f.type === 'photo_stamped' || f.type === 'facial_recognition';
  const isFacial = f.type === 'facial_recognition';
  const fallbackTaskTs = t.completedAt
    ? new Date(t.completedAt).toLocaleString('pt-BR')
    : fd(t.createdAt);
  const resolveStampTs = (singleVal) =>
    parseCapturedAtFromPhotoUri(singleVal) || formatFieldTimeIso(fieldTimeIso) || fallbackTaskTs;

  return urls
    .map((rawU, i) => {
      const singleVal = String(rawU);
      const stampTs = resolveStampTs(singleVal);
      const idxLine = urls.length > 1 ? ` · Foto ${i + 1}` : '';

      if (isFacial) {
        let imgInnerHtml;
        if (
          singleVal.startsWith('http://') ||
          singleVal.startsWith('https://') ||
          singleVal.startsWith('data:image')
        ) {
          const imgSrc = esc(singleVal);
          imgInnerHtml = `<img src="${imgSrc}" alt="" class="pdf-photo-img" style="max-width:100%;max-height:280px;width:auto;height:auto;object-fit:contain;display:block" onerror="this.src='https://placehold.co/400x300?text=Foto'" />`;
        } else if (singleVal.startsWith('file://')) {
          imgInnerHtml = `<div style="padding:20px;text-align:center;color:#78350f;font-size:10px;font-weight:700;line-height:1.45">Mídia ainda em arquivo local. Sincronize para incluir a imagem no PDF.</div>`;
        } else if (singleVal) {
          imgInnerHtml = `<div style="padding:16px;text-align:center;color:#64748b;font-size:10px;font-weight:600">Pré-visualização indisponível para este ficheiro.</div>`;
        } else {
          imgInnerHtml = `<img src="https://placehold.co/360x200/f1f5f9/94a3b8?text=Foto" alt="" style="max-width:100%;max-height:220px;object-fit:contain;display:block" />`;
        }
        const block = buildFacialRecognitionPdfCard({
          singleVal,
          imgInnerHtml,
          field: f,
          responses,
          row,
          esc,
          fotoIndexLabel: idxLine,
          fieldTimeIso,
        });
        return block + pdfMediaCapPreview(id, i, responses, row);
      }

      let block;
      if (
        singleVal.startsWith('http://') ||
        singleVal.startsWith('https://') ||
        singleVal.startsWith('data:image')
      ) {
        const imgSrc = esc(singleVal);
        const showFooter = !!(stampTypes || singleVal.includes('live'));
        const imgInner = `<img src="${imgSrc}" class="pdf-photo-img" style="border-radius:0;width:100%;height:auto;min-height:180px;object-fit:cover;display:block" alt="" onerror="this.src='https://placehold.co/400x300?text=Foto'" />`;
        block = `
          <div class="pdf-photo-card" style="margin-top:8px;max-width:350px;margin-left:auto;margin-right:auto;background:#EA580C;border:1px solid #c2410c;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
            ${imgInner}
            ${
              showFooter
                ? `<div style="background:#EA580C;color:#fff;padding:10px 12px;font-size:8px;font-weight:700;line-height:1.4;box-sizing:border-box;font-family:monospace">🕒 ${esc(stampTs)}${esc(idxLine)}</div>`
                : ''
            }
          </div>`;
      } else if (singleVal.startsWith('file://')) {
        if (stampTypes) {
          const showFooter = !!(stampTypes || singleVal.includes('live'));
          const body = `<div style="min-height:180px;background:#fff7ed;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
              <div style="text-align:center;color:#9a3412;font-size:10px;font-weight:700">Mídia ainda em arquivo local — após sincronizar, a imagem aparece aqui no PDF.</div>
            </div>`;
          block = `
          <div class="pdf-photo-card" style="margin-top:8px;max-width:350px;margin-left:auto;margin-right:auto;background:#EA580C;border:1px solid #c2410c;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">
            ${body}
            ${
              showFooter
                ? `<div style="background:#EA580C;color:#fff;padding:10px 12px;font-size:8px;font-weight:700;line-height:1.4;box-sizing:border-box;font-family:monospace">🕒 ${esc(stampTs)}${esc(idxLine)}</div>`
                : ''
            }
          </div>`;
        } else {
          block = `<div style="margin-top:8px;padding:20px;max-width:350px;background:#f8fafc;text-align:center;border:2px dashed #cbd5e1;border-radius:8px;">
          <ion-icon name="cloud-offline-outline" style="font-size:32px;color:#94a3b8;margin-bottom:8px;"></ion-icon>
          <div style="font-size:12px;color:#475569;font-weight:800;">MÍDIA PENDENTE${urls.length > 1 ? ' (' + (i + 1) + ')' : ''}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:4px;">Aguardando sincronização para pré-visualizar a foto.</div>
        </div>`;
        }
      } else if (singleVal) {
        block = `<div style="padding:12px;border:1px solid ${th.colorBorder};border-radius:8px;font-size:10px;color:${th.colorMuted}">Pré-visualização indisponível para este arquivo</div>`;
      } else {
        block = `<div class="pdf-photo-card" style="margin-top:8px;max-width:350px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <img class="pdf-photo-img" style="min-height:180px;border-radius:0" src="https://placehold.co/360x200/f1f5f9/94a3b8?text=Foto" alt="" />
        </div>`;
      }
      return block + pdfMediaCapPreview(id, i, responses, row);
    })
    .join('');
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

  const formEntries = buildPreviewPdfEntries(t, schemaFields || []);

  for (const entry of formEntries) {
    if (entry.kind === '__repeat_hdr') {
      formHtml += `<div style="margin:20px 0 8px;padding:10px 14px;background:#eef2ff;border-left:4px solid #6366f1;border-radius:0 10px 10px 0;font-size:12px;font-weight:800;color:#3730a3">${esc(entry.sectionLabel)} · Instância ${entry.instanceNum}</div>`;
      continue;
    }

    const f = entry.fieldDef;
    const id = entry.id;
    if (!f || !id) continue;
    if (!isFieldVisible(cfg, id, f.type)) continue;
    if (f.type === 'transit_start' || f.type === 'transit_end') continue;
    const pTypes = ['photo', 'photo_stamped', 'facial_recognition'];
    if (pTypes.includes(f.type) && !m.photoGallery) continue;

    const row = entry.row;
    const rowIdx = entry.rowIdx;
    const repeatSid = entry.repeatSid;

    const val = row && typeof row === 'object' ? row[id] : responses[id];
    if (cfg.hideEmptyFields && f.type !== 'section_break' && pdfValueIsEmpty(val)) continue;

    const labelOv = fieldLabelOverride(cfg, id);
    const labelBase = labelOv || f.label || id;
    const lab =
      row != null && repeatSid != null && !entry.omitInstanceInLabel
        ? `${labelBase} · Instância ${rowIdx + 1}`
        : labelBase;

    let tIso = null;
    if (repeatSid != null && rowIdx != null) {
      tIso = responses[`__time_${repeatSid}_r${rowIdx}_${id}`];
    }
    if (!tIso) tIso = responses[`__time_${id}`];
    let timeHtml = '';
    if (tIso) {
      const humanTime = new Date(tIso).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      timeHtml = `<span style="font-size:9px; color:#94a3b8; margin-left:8px; font-weight:600; text-transform:none;"><ion-icon name="time-outline" style="vertical-align:-2px; margin-right:2px;"></ion-icon>${esc(humanTime)}</span>`;
    }

    if (f.type === 'section_break') {
      const startIso = responses[`__section_start_${id}`];
      const endIso = responses[`__section_end_${id}`];
      const formatTime = (iso) =>
        iso
          ? new Date(iso).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          : '--:--';
      let durationStr = '';
      if (startIso && endIso) {
        const diffSecs = Math.floor(
          (new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000,
        );
        const m = Math.floor(diffSecs / 60);
        const s = diffSecs % 60;
        durationStr = `${m}m ${s}s`;
      }
      const fmtIsoShort = (iso) =>
        iso
          ? new Date(iso).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—';
      formHtml += `
            <div style="background: linear-gradient(90deg, #f1f5f9 0%, #ffffff 100%); border-left: 4px solid #8b5cf6; padding: 12px 16px; margin: 25px 0 10px -20px; border-radius: 0 8px 8px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative; z-index: 5;">
               <div style="font-size:13px; font-weight:900; color:#0f172a; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; display:flex; align-items:center;">
                  <ion-icon name="albums" style="color:#8b5cf6; margin-right:8px; font-size:16px;"></ion-icon>${esc(lab)}
               </div>
               <div style="font-size:9px;color:#94a3b8;margin-bottom:6px;font-weight:600">Contador de etapa (início/fim automáticos no app)</div>
               <div style="font-size:10px; color:#64748b; font-weight:600; display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
                  <span style="background:#e2e8f0; padding:2px 6px; border-radius:4px;"><ion-icon name="play-circle-outline"></ion-icon> Início: ${formatTime(startIso)} <span style="opacity:0.85">(${fmtIsoShort(startIso)})</span></span>
                  <span style="background:#e2e8f0; padding:2px 6px; border-radius:4px;"><ion-icon name="stop-circle-outline"></ion-icon> Fim: ${formatTime(endIso)} <span style="opacity:0.85">(${fmtIsoShort(endIso)})</span></span>
                  ${durationStr ? `<span style="color:#8b5cf6; font-weight:800;"><ion-icon name="time-outline"></ion-icon> Duração: ${esc(durationStr)}</span>` : startIso && !endIso ? `<span style="color:#94a3b8;font-weight:700">Em curso ou não concluída no envio</span>` : ''}
               </div>
            </div>
          `;
      continue;
    }

    if (f.type === 'signature_summary') {
      const inner = formatSignatureSummaryPdfBlock(val, f, th, responses, row, schemaFields || []);
      formHtml += `
        <div class="pdf-form-item" style="position:relative;">
           <div class="pdf-form-num" style="background:${th.formNumBg}">${qNum++}</div>
           <div class="pdf-q" style="display:flex; justify-content:space-between; align-items:center;">
             <span>${esc(lab)}</span>
             ${timeHtml}
           </div>
           <div class="pdf-a">${inner}</div>
           ${techCommentBlockHtml(f, responses, row)}
        </div>`;
      continue;
    }

    if (f.type === 'photo' || f.type === 'photo_stamped' || f.type === 'facial_recognition') {
      const inner = renderPhotoPdfBlock(val, f, th, t, responses, row, tIso);
      formHtml += `
        <div class="pdf-form-item" style="position:relative;">
           <div class="pdf-form-num" style="background:${th.formNumBg}">${qNum++}</div>
           <div class="pdf-q" style="display:flex; justify-content:space-between; align-items:center;">
             <span>${esc(lab)}</span>
             ${timeHtml}
           </div>
           <div class="pdf-a">${inner}</div>
           ${techCommentBlockHtml(f, responses, row)}
        </div>`;
      continue;
    }

    const special = formatSpecialFieldHtml(val, f, th, responses, row);
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
    } else if (Array.isArray(val)) {
      display = val
        .map((v) => `<span class="pdf-pill" style="background:${th.pillYesBg}">${esc(v)}</span>`)
        .join(' ');
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
           ${techCommentBlockHtml(f, responses, row)}
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
      <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:0">
        <div style="padding:10px; border-right:1px solid ${th.colorBorder}; background:${th.colorSurface}">
          <div style="font-size:8px; font-weight:900; color:${th.colorMuted}; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid ${th.colorBorder}; display:flex; align-items:center; gap:4px">
            <ion-icon name="hardware-chip-outline" style="font-size:12px"></ion-icon> Sistema
          </div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">ID técnico</div><div style="font-size:9px;color:${th.colorText};font-weight:600;margin-top:1px;font-family:monospace;word-break:break-all">${esc(t.id || '')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Ref. Integração</div><div style="font-size:9px;color:${th.colorText};font-weight:600;margin-top:1px;font-family:monospace;word-break:break-all">${esc(t.refId || t.metadata?.refId || '—')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Formulário</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.template?.title || 'N/A')}</div></div>
          <div><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Origem</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.metadata?.devicePlatform || 'Painel Admin')}</div></div>
        </div>
        <div style="padding:10px; border-right:1px solid ${th.colorBorder}">
          <div style="font-size:8px; font-weight:900; color:${th.colorMuted}; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; padding-bottom:4px; border-bottom:2px solid ${th.colorBorder}; display:flex; align-items:center; gap:4px">
            <ion-icon name="information-circle-outline" style="font-size:12px"></ion-icon> Identificação
          </div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Nº OS</div><div style="font-size:10px;color:${th.colorText};font-weight:800;margin-top:1px;font-family:monospace;word-break:break-all">${esc(displayOsLabel(t))}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Submissão indexada (última)</div><div style="font-size:10px;color:${th.colorText};font-weight:800;margin-top:1px">${esc(displayLastRevPreview(t))}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Reaberturas</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${Number(t.metadata?.reopenCount) > 0 ? esc(String(t.metadata.reopenCount)) : '—'}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Local de atendimento</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${formatServiceLocationInnerHtml(t, esc)}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Título da OS</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.title || '—')}</div></div>
          <div style="margin-bottom:4px"><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Descrição</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.description || 'Não preenchido')}</div></div>
          <div><div style="font-size:8px;color:${th.colorMutedLight};font-weight:700;letter-spacing:0.5px;text-transform:uppercase">Prioridade</div><div style="font-size:10px;color:${th.colorText};font-weight:600;margin-top:1px">${esc(t.metadata?.priority || 'Normal')}</div></div>
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
    ${buildPatrolRoutePdfBlockPreview(th, t, enPrev)}
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

  // Fotos reais já entram em `pieceForm` quando `m.photoGallery` está ligado (como no PDF da Central).
  // Não há seção separada com dados da API só para a galeria — o placeholder antigo confundia a pré-visualização.
  const piecePhoto = '';

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
