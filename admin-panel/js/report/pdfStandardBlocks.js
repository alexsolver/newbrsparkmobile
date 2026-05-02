/**
 * Fragmentos alinhados ao PDF da Central de Operações (operations.html / printReport).
 */

/** Atributo HTML seguro para `src` / `href` (mantém query string — URLs assinadas S3/R2). */
export function escapeHtmlAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/** PDF / anexos: extensões que não devem ser tratadas como `<img>`. */
export function isClearlyNonImageHttpUrl(s) {
  const u = String(s ?? '').trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  const path = (u.split(/[?#]/)[0] || '').toLowerCase();
  return /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt|mp4|webm|mov|mpe?g|mp3|wav|m4a|ogg)(\?|$)/i.test(
    path,
  );
}

/** `data:image/*`, ou HTTP(S) que não é claramente documento/vídeo — usar `<img>` no relatório. */
export function shouldEmbedHttpUrlAsImage(s) {
  const u = String(s ?? '').trim();
  if (u.startsWith('data:image/')) return true;
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  return !isClearlyNonImageHttpUrl(u);
}

/** Data/hora da captura na query `capturedAt` (igual ao app / fotos carimbadas). */
export function parseCapturedAtFromPhotoUriPdf(uri) {
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

function formatIsoPtBr(iso) {
  if (!iso) return '';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR');
}

/** Linha de rodapé «carimbada» para blocos de visão IA. */
export function visionMediaStampLine(o, mediaUri) {
  const fromUri = parseCapturedAtFromPhotoUriPdf(mediaUri);
  if (fromUri) return fromUri;
  for (const k of ['processedAt', 'pendingSince', 'capturedAt']) {
    const t = o && o[k];
    if (typeof t === 'string' && t.trim()) {
      const f = formatIsoPtBr(t);
      if (f) return f;
    }
  }
  return 'Data/hora não registada na mídia';
}

function parseMediaUriGeoForVisionStamp(uri) {
  try {
    const s = String(uri || '');
    const qi = s.indexOf('?');
    if (qi < 0) return { lat: '', lng: '', addr: '' };
    const sp = new URLSearchParams(s.slice(qi));
    const lat = (sp.get('lat') || '').trim();
    const lng = (sp.get('lng') || '').trim();
    let addr = '';
    const a = sp.get('addr');
    if (a) {
      try {
        addr = decodeURIComponent(a).replace(/\+/g, ' ').trim();
      } catch {
        addr = String(a).trim();
      }
    }
    return { lat, lng, addr };
  } catch {
    return { lat: '', lng: '', addr: '' };
  }
}

/**
 * GPS + morada no carimbo (objeto de resposta e/ou query na URI da captura).
 * @param {Record<string, unknown>|null|undefined} o
 * @param {string} mediaUri
 */
export function visionMediaGeoStampLine(o, mediaUri) {
  let lat = o && o.captureLat != null ? String(o.captureLat).trim() : '';
  let lng = o && o.captureLng != null ? String(o.captureLng).trim() : '';
  let addr = o && typeof o.captureAddr === 'string' ? o.captureAddr.trim() : '';
  if (!lat || !lng || !addr) {
    const q = parseMediaUriGeoForVisionStamp(mediaUri);
    if (!lat) lat = q.lat;
    if (!lng) lng = q.lng;
    if (!addr) addr = q.addr;
  }
  const parts = [];
  if (lat && lng) parts.push(`${lat}, ${lng}`);
  if (addr) parts.push(addr);
  return parts.join(' · ');
}

/**
 * @param {'vision'|'annotation'} kind — rótulo do rodapé (visão IA vs foto com anotações).
 * @param {string} [geoStampLine] — GPS e morada (só visão IA; opcional).
 */
function wrapVisionStampedMedia(innerHtml, stampLine, escHtml, kind = 'vision', geoStampLine = '') {
  const badge = kind === 'annotation' ? 'Foto com anotações' : 'Visão IA';
  const geo = String(geoStampLine || '').trim();
  const geoBlock = geo
    ? `<div style="margin-top:4px;font-size:7.5px;font-weight:600;line-height:1.35;opacity:0.97">📍 ${escHtml(geo)}</div>`
    : '';
  return `<div class="pdf-photo-card" style="margin-top:8px;max-width:400px;margin-left:auto;margin-right:auto;background:#EA580C;border:1px solid #c2410c;border-radius:8px;overflow:hidden;display:flex;flex-direction:column">
    <div style="background:#e2e8f0;line-height:0">${innerHtml}</div>
    <div style="background:#EA580C;color:#fff;padding:8px 10px;font-size:8px;font-weight:700;line-height:1.35;box-sizing:border-box;font-family:ui-monospace,monospace">🕒 ${escHtml(stampLine)} · ${escHtml(badge)}${geoBlock}</div>
  </div>`;
}

/** Foto com anotações vinda da galeria: sem carimbo laranja (só moldura neutra). */
function wrapAnnotationGalleryMedia(innerHtml) {
  return `<div style="margin-top:8px;max-width:400px;margin-left:auto;margin-right:auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff">
    <div style="background:#f8fafc;line-height:0">${innerHtml}</div>
  </div>`;
}

/** Primeira URI HTTP(S) entre candidatos (URLs públicas após sync). */
export function pickFirstHttpsMediaUri(...candidates) {
  for (const c of candidates) {
    const u = String(c ?? '').trim();
    if (u.startsWith('https://') || u.startsWith('http://')) return u;
  }
  return '';
}

function localMediaUnavailableHtml(escHtml) {
  return `<div style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12px;color:#9a3412;line-height:1.45;font-weight:600">${escHtml(
    'A imagem ficou só no dispositivo (URI local). Sincronize de novo com internet para enviar a mídia ao servidor — depois o relatório mostra a foto.',
  )}</div>`;
}

/**
 * Nota de voz — valor no app: `{ transcript, phase?, error? }` ou JSON em string.
 * @param {unknown} val
 * @param {(s: string) => string} escHtml
 * @returns {string|null}
 */
export function buildVoiceNoteReportHtml(val, escHtml) {
  let o = null;
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return null;
    try {
      const j = JSON.parse(t);
      o = j && typeof j === 'object' && !Array.isArray(j) ? j : null;
    } catch {
      return `<div style="padding:12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px"><div style="font-size:9px;font-weight:800;color:#6d28d9;text-transform:uppercase;margin-bottom:6px">Nota de voz (texto)</div><div style="font-size:13px;line-height:1.5;color:#0f172a">${escHtml(t)}</div></div>`;
    }
  } else if (val && typeof val === 'object' && !Array.isArray(val)) {
    o = val;
  }
  if (!o) return null;
  const tr = String(o.transcript ?? '').trim();
  const phase = String(o.phase ?? '').trim();
  const err = String(o.error ?? '').trim();
  const parts = [];
  if (tr) {
    parts.push(
      `<div style="font-size:13px;line-height:1.55;color:#0f172a;font-weight:500">${escHtml(tr)}</div>`,
    );
  }
  if (!tr && phase === 'error' && err) {
    parts.push(`<div style="color:#b91c1c;font-size:12px;font-weight:600">${escHtml(err)}</div>`);
  }
  if (!tr && !parts.length && phase && phase !== 'done' && phase !== 'idle') {
    parts.push(
      `<div style="color:#64748b;font-size:11px;font-style:italic">${escHtml(`Estado: ${phase}`)}</div>`,
    );
  }
  if (!parts.length) {
    return `<span style="color:#94a3b8;font-style:italic">Nota de voz sem transcrição registada.</span>`;
  }
  return `<div style="padding:12px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px"><div style="font-size:9px;font-weight:800;color:#6d28d9;text-transform:uppercase;margin-bottom:8px">Nota de voz (transcrição)</div>${parts.join('')}</div>`;
}

export function parsePauseHistoryFromResponses(responses) {
  if (!responses || typeof responses !== 'object') return [];
  let h = responses.__pause_history;
  if (typeof h === 'string') {
    try {
      h = JSON.parse(h);
    } catch {
      h = [];
    }
  }
  return Array.isArray(h) ? h : [];
}

/**
 * Rótulo legível para `answers[].value` da visão IA (sim/não ou resposta livre, ex. nota).
 * @param {unknown} raw
 * @returns {string}
 */
export function formatVisionIaAnswerLabel(raw) {
  const s = String(raw ?? '').trim();
  const v = s.toLowerCase();
  if (v === 'yes' || v === 'sim') return 'Sim';
  if (v === 'no' || v === 'não' || v === 'nao') return 'Não';
  if (v === 'unknown' || v === 'indefinido' || v === 'indeterminado') return 'Não verificado (IA)';
  return s || '—';
}

export function sumPauseDurationSeconds(pauseHist) {
  let total = 0;
  if (!Array.isArray(pauseHist)) return 0;
  for (const ev of pauseHist) {
    if (!ev) continue;
    if (ev.endedAt == null || ev.endedAt === '') continue;
    if (ev.durationSec == null || !Number.isFinite(Number(ev.durationSec))) continue;
    total += Math.max(0, Number(ev.durationSec));
  }
  return total;
}

export function buildPauseHistoryTableRowsHtml(pauseHist, escFn, fmtDurFn, tdStyle) {
  if (!Array.isArray(pauseHist) || pauseHist.length === 0) return '';
  const td =
    tdStyle || 'padding:8px;border-bottom:1px solid var(--border);vertical-align:top;font-size:11px';
  return pauseHist
    .map((ev, idx) => {
      const hasEnd = ev.endedAt != null && String(ev.endedAt).trim() !== '';
      const dur =
        hasEnd && ev.durationSec != null && Number.isFinite(Number(ev.durationSec))
          ? fmtDurFn(Number(ev.durationSec))
          : ev.startedAt && !hasEnd
            ? 'Em curso / sem fim'
            : '—';
      const line = [ev.categoryLabel, ev.subLabel, ev.detail].filter(Boolean).join(' — ');
      const start = ev.startedAt
        ? new Date(ev.startedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
      const end = hasEnd
        ? new Date(ev.endedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—';
      return `<tr><td style="${td};font-weight:800">${idx + 1}</td><td style="${td}">${escFn(line)}</td><td style="${td};font-size:10px;color:#64748b">${start}<br/>→ ${end}</td><td style="${td};font-weight:700">${dur}</td></tr>`;
    })
    .join('');
}

/**
 * @param {(s: string) => string} escPdf
 * @param {(sec: number) => string} fmtDurPdf
 */
export function buildPauseProductivityPdfFragment(escPdf, fmtDurPdf, t, responses) {
  const metadata = t.metadata || {};
  const pauseHist = parsePauseHistoryFromResponses(responses);
  const totalSec = sumPauseDurationSeconds(pauseHist);
  const metaBits = [];
  if (metadata.lastPauseReasonSummary) {
    metaBits.push(
      `<div style="font-size:7px;line-height:1.3;margin-bottom:4px"><span style="color:#78350f;font-weight:800">Último resumo:</span> ${escPdf(String(metadata.lastPauseReasonSummary))}</div>`,
    );
  }
  if (responses.__form_paused_since) {
    const d = new Date(responses.__form_paused_since);
    if (!isNaN(d.getTime())) {
      metaBits.push(
        `<div style="font-size:7px;line-height:1.3;margin-bottom:4px"><span style="color:#78350f;font-weight:800">Pausa no formulário:</span> ${d.toLocaleString('pt-BR')}</div>`,
      );
    }
  }
  const tdPdf = 'padding:5px 7px;border-bottom:1px solid #fde68a;vertical-align:top;font-size:8px';
  const rows = buildPauseHistoryTableRowsHtml(pauseHist, escPdf, fmtDurPdf, tdPdf);
  if (!rows && metaBits.length === 0) {
    return `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #fde68a">
      <div style="font-size:7px;font-weight:900;color:#92400e;letter-spacing:.4px;text-transform:uppercase;margin-bottom:4px">Pausas no atendimento</div>
      <div style="font-size:7px;color:#94a3b8;font-style:italic">Sem registro de pausas.</div>
    </div>`;
  }
  let inner = metaBits.join('');
  if (rows) {
    inner += `<div style="display:flex;flex-wrap:wrap;gap:6px 12px;font-size:7px;margin:6px 0 4px;color:#475569">
      <span><span style="color:#92400e;font-weight:800">Tempo em pausa:</span> <strong style="color:#0f172a">${totalSec > 0 ? fmtDurPdf(totalSec) : '—'}</strong></span>
      <span><span style="color:#92400e;font-weight:800">Registos:</span> <strong style="color:#0f172a">${pauseHist.length}</strong></span>
    </div>`;
    inner += `<table style="width:100%;border-collapse:collapse;border:1px solid #fde68a;border-radius:6px;overflow:hidden;margin-top:4px">
      <thead><tr style="background:#fef3c7">
        <th style="text-align:left;padding:4px 6px;font-size:7px;color:#78350f;font-weight:900">#</th>
        <th style="text-align:left;padding:4px 6px;font-size:7px;color:#78350f;font-weight:900">Motivo</th>
        <th style="text-align:left;padding:4px 6px;font-size:7px;color:#78350f;font-weight:900">Início → Fim</th>
        <th style="text-align:left;padding:4px 6px;font-size:7px;color:#78350f;font-weight:900">Duração</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  return `<div style="margin-top:6px;padding:8px 10px 10px;background:linear-gradient(180deg,#fffbeb 0%,#fff 70%);border:1px solid #fde68a;border-radius:8px;box-sizing:border-box">
    <div style="font-size:7px;font-weight:900;color:#92400e;letter-spacing:.45px;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;gap:4px">
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b"></span> Pausas no atendimento
    </div>
    ${inner}
  </div>`;
}

/**
 * Tempos por etapa — mesmo critério que collectSectionTimingRows em operations.html (sem schemaData).
 */
export function collectSectionTimingRowsForPreview(sectionBreaks, responses) {
  const rows = [];
  const seen = new Set();
  if (!responses || typeof responses !== 'object') return rows;

  const labelById = Object.create(null);
  if (Array.isArray(sectionBreaks)) {
    sectionBreaks.forEach((s) => {
      if (s && s.id && s.label != null && String(s.label).trim() !== '') {
        labelById[s.id] = String(s.label).trim();
      }
    });
  }

  const pushRow = (id, labelHint) => {
    if (!id || seen.has(id)) return;
    const startIso = responses['__section_start_' + id];
    const endIso = responses['__section_end_' + id];
    let sec = null;
    if (startIso && endIso) {
      const a = new Date(startIso).getTime();
      const b = new Date(endIso).getTime();
      if (!Number.isNaN(a) && !Number.isNaN(b)) sec = Math.max(0, Math.floor((b - a) / 1000));
    }
    const hint = labelHint != null && String(labelHint).trim() !== '' ? String(labelHint).trim() : '';
    let lab = '';
    if (hint && hint !== id) lab = hint;
    else if (labelById[id]) lab = labelById[id];
    else if (id === 'page_1') lab = 'Início (antes da 1ª etapa)';
    else lab = hint || id;
    rows.push({ sectionId: id, label: lab.trim() || id, sec });
    seen.add(id);
  };

  if (Array.isArray(sectionBreaks)) {
    sectionBreaks.forEach((f) => {
      if (!f || !f.id) return;
      pushRow(f.id, f.label);
    });
  }

  Object.keys(responses).forEach((k) => {
    const m = k.match(/^__section_start_(.+)$/);
    if (!m) return;
    const id = m[1];
    if (seen.has(id)) return;
    pushRow(id, labelById[id] || (id === 'page_1' ? 'Início (antes da 1ª etapa)' : id));
  });

  rows.sort((a, b) => {
    const p = (r) => (r.sectionId === 'page_1' ? 0 : 1);
    return p(a) - p(b);
  });

  return rows;
}

/**
 * Nota de voz guarda `localUri` para o ficheiro de áudio — não confundir com visão IA
 * (senão o relatório tenta `<img src="…m4a">` → «Foto indisponível»).
 * @param {Record<string, unknown>|null|undefined} o
 */
function looksLikeVoiceNotePayload(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (Array.isArray(o.answers) && o.answers.length > 0) return false;
  const mt = String(o.mediaMimeType || o.mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (mt.startsWith('audio/')) return true;
  const fn = String(o.fileName || '').toLowerCase();
  if (/\.(m4a|mp3|wav|aac|ogg|opus|caf|flac)(\?|$)/i.test(fn)) return true;
  const lu = String(o.localUri || '').split('?')[0].toLowerCase();
  if (/(m4a|mp3|wav|aac|ogg|opus)(\?|$)/i.test(lu)) return true;
  const ph = String(o.phase || o.status || '').toLowerCase();
  if (
    ph &&
    (ph.includes('pending_transcription') ||
      ph === 'recording' ||
      ph === 'uploading' ||
      ph === 'done' ||
      ph === 'error' ||
      ph === 'idle')
  ) {
    if (Object.prototype.hasOwnProperty.call(o, 'transcript')) return true;
  }
  /* Concluída: só transcrição + URL de áudio (registos antigos sem `phase`). */
  if (
    typeof o.transcript === 'string' &&
    o.transcript.trim() !== '' &&
    !(Array.isArray(o.answers) && o.answers.length > 0)
  ) {
    const mt0 = String(o.mediaMimeType || o.mimeType || '').toLowerCase();
    if (mt0.startsWith('image/') || mt0.startsWith('video/')) return false;
    const path0 = String(o.localUri || '').split('?')[0].toLowerCase();
    if (/\.(jpe?g|png|gif|webp|heic)(\?|$)/i.test(path0)) return false;
    return true;
  }
  return false;
}

/**
 * HTML para PDF / pré-visualização: `vision_checklist` e `vision_ai_analysis`.
 * Se existir `gridSlotUris` com mais de uma URI (Gemini, grelha), mostra miniaturas por célula antes da imagem composta (`localUri`).
 * @param {unknown} val
 * @param {'vision_checklist'|'vision_ai_analysis'|'vision_ai_comparison'} fieldType
 * @param {(s: string) => string} escHtml
 * @returns {string|null}
 */
function looksLikeVisionPayloadObject(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (looksLikeVoiceNotePayload(o)) return false;
  /* Foto com anotações usa `imageUri` + `strokes` — não confundir com visão IA. */
  if (Array.isArray(o.strokes) || Array.isArray(o.annotations)) return false;
  const keys = [
    'status',
    'localUri',
    'remoteUri',
    'publicUrl',
    'mediaUrl',
    'uploadedUri',
    'imageUri',
    'url',
    'downloadUrl',
    'attachmentUrl',
    'photoUrl',
    'thumbnailUrl',
    'previewUrl',
    'src',
    'mediaMimeType',
    'mediaFileName',
    'answers',
    'analysis',
    'result',
    'gridSlotUris',
    'captureLat',
    'captureLng',
    'captureAddr',
  ];
  return keys.some((k) => Object.prototype.hasOwnProperty.call(o, k));
}

function collectVisionHttpsUriCandidates(o) {
  if (!o || typeof o !== 'object') return [];
  const keys = [
    'localUri',
    'remoteUri',
    'publicUrl',
    'mediaUrl',
    'uploadedUri',
    'imageUri',
    'url',
    'downloadUrl',
    'attachmentUrl',
    'photoUrl',
    'thumbnailUrl',
    'previewUrl',
    'src',
  ];
  const out = [];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k)) out.push(o[k]);
  }
  /** Grelha 1×1/2×2: a URL pública pode estar só em `gridSlotUris` (composto ainda local). */
  if (Array.isArray(o.gridSlotUris)) {
    for (const u of o.gridSlotUris) {
      out.push(u);
    }
  }
  return out;
}

function parseVisionPayloadCandidate(val) {
  let cur = val;
  for (let i = 0; i < 5; i++) {
    if (cur == null) return null;
    if (typeof cur === 'string') {
      const s = cur.trim();
      if (!s || !(s.startsWith('{') || s.startsWith('"'))) return null;
      try {
        cur = JSON.parse(s);
        continue;
      } catch {
        return null;
      }
    }
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      if (looksLikeVisionPayloadObject(cur)) return cur;
      const nested = cur.payload ?? cur.value ?? cur.data ?? cur.result ?? cur.analysis;
      if (nested == null) return null;
      cur = nested;
      continue;
    }
    return null;
  }
  return null;
}

export function buildVisionChecklistReportHtml(val, fieldType, escHtml) {
  const o = parseVisionPayloadCandidate(val);
  if (!o || typeof o !== 'object') return null;
  if (looksLikeVoiceNotePayload(o)) return null;

  let html = '';
  const st = String(o.status || '').toLowerCase();
  if (st === 'pending_analysis') {
    html += `<div style="padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:10px;font-size:12px;color:#9a3412;font-weight:700;line-height:1.45">${escHtml(
      'Análise de visão IA pendente no servidor (mídia guardada no dispositivo ou envio ainda não concluído).',
    )}</div>`;
  }

  const rawLocal = o.localUri != null ? String(o.localUri).trim() : '';
  const httpsPrimary = pickFirstHttpsMediaUri(...collectVisionHttpsUriCandidates(o));
  const rawSlots = Array.isArray(o.gridSlotUris) ? o.gridSlotUris : [];
  const slots = rawSlots.map((u) => String(u || '').trim()).filter(Boolean);
  const answers = (() => {
    const out = [];
    const push = (arr) => {
      if (!Array.isArray(arr)) return;
      arr.forEach((x) => {
        if (x && typeof x === 'object') out.push(x);
      });
    };
    push(o.answers);
    if (!out.length && o.analysis && typeof o.analysis === 'object') push(o.analysis.answers);
    if (!out.length && o.result && typeof o.result === 'object') push(o.result.answers);
    if (!out.length && o.data && typeof o.data === 'object') push(o.data.answers);
    if (!out.length) push(o.responses);
    if (!out.length && Array.isArray(o.questions)) {
      push(
        o.questions.filter(
          (q) =>
            q &&
            typeof q === 'object' &&
            (q.value !== undefined || q.answer !== undefined || q.yes !== undefined || q.count !== undefined),
        ),
      );
    }
    if (!out.length && o.answers && typeof o.answers === 'object' && !Array.isArray(o.answers)) {
      Object.entries(o.answers).forEach(([questionId, ans]) => {
        if (ans && typeof ans === 'object' && !Array.isArray(ans)) {
          out.push({ questionId, ...ans });
        } else {
          out.push({ questionId, value: ans });
        }
      });
    }
    return out;
  })();
  const stampRefUri = httpsPrimary || rawLocal || (slots[0] ?? '');
  const mainStamp = visionMediaStampLine(o, stampRefUri);
  const mainGeo = visionMediaGeoStampLine(o, stampRefUri);

  if ((fieldType === 'vision_ai_analysis' || fieldType === 'vision_ai_comparison') && slots.length > 1) {
    html += `<div style="font-size:10px;font-weight:800;color:#991b1b;margin:0 0 8px;letter-spacing:0.02em">${escHtml(`Fotos individuais da grelha (${slots.length})`)}</div>`;
    html += `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px">`;
    slots.forEach((u, i) => {
      const slotHttps = pickFirstHttpsMediaUri(u);
      const slotStamp = visionMediaStampLine(o, u);
      const slotGeo = visionMediaGeoStampLine(o, u);
      let inner;
      if (slotHttps) {
        const srcEsc = escapeHtmlAttr(slotHttps);
        inner = `<img src="${srcEsc}" alt="" style="width:100%;max-height:140px;object-fit:cover;display:block" onerror="this.onerror=null;this.src='https://placehold.co/320x160/f1f5f9/64748b?text=Foto+indispon%C3%ADvel'"/>`;
      } else if (u.startsWith('file://') || u.startsWith('content://')) {
        inner = localMediaUnavailableHtml(escHtml);
      } else {
        inner = `<div style="padding:8px;font-size:10px;color:#64748b">${escHtml('Sem URL pública para esta célula.')}</div>`;
      }
      const hrefEsc = escapeHtmlAttr(slotHttps || u);
      html += `<div style="flex:0 0 auto;width:148px;max-width:40%">`;
      html += `<div style="font-size:9px;color:#64748b;margin-bottom:4px;font-weight:700">${escHtml(`Célula ${i + 1}`)}</div>`;
      html += wrapVisionStampedMedia(inner, slotStamp, escHtml, 'vision', slotGeo);
      if (slotHttps) {
        html += `<div style="font-size:9px;margin-top:4px"><a href="${hrefEsc}" target="_blank" rel="noopener" style="color:#3b82f6;font-weight:600">Abrir foto</a></div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  if (rawLocal || httpsPrimary) {
    const isVideo =
      o.mediaMimeType != null && String(o.mediaMimeType).toLowerCase().startsWith('video');
    const title =
      (fieldType === 'vision_ai_analysis' || fieldType === 'vision_ai_comparison') && slots.length > 1
        ? 'Imagem enviada à análise (composta)'
        : 'Mídia analisada';
    html += `<div style="font-size:10px;font-weight:800;color:#0f172a;margin:0 0 6px">${escHtml(title)}</div>`;
    if (!isVideo) {
      if (httpsPrimary) {
        const srcEsc = escapeHtmlAttr(httpsPrimary);
        const hrefEsc = escapeHtmlAttr(httpsPrimary);
        const innerImg = `<img src="${srcEsc}" alt="" style="max-width:100%;max-height:300px;width:100%;height:auto;object-fit:contain;display:block" onerror="this.onerror=null;this.src='https://placehold.co/560x320/f1f5f9/64748b?text=Foto+indispon%C3%ADvel'"/>`;
        html += wrapVisionStampedMedia(innerImg, mainStamp, escHtml, 'vision', mainGeo);
        html += `<div style="font-size:11px;margin-top:6px"><a href="${hrefEsc}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:600">Abrir mídia</a></div>`;
      } else {
        html += wrapVisionStampedMedia(localMediaUnavailableHtml(escHtml), mainStamp, escHtml, 'vision', mainGeo);
      }
    } else {
      const hrefEsc = escapeHtmlAttr(httpsPrimary || rawLocal);
      html += `<div style="padding:10px;background:#0f172a;border-radius:8px;color:#e2e8f0;font-size:12px">Vídeo anexado — <a href="${hrefEsc}" target="_blank" style="color:#7dd3fc">Abrir</a></div>`;
    }
  }

  if (answers.length) {
    html += `<div style="margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0"><div style="font-size:10px;font-weight:800;color:#64748b;margin-bottom:8px">Respostas da IA</div>`;
    const r10 =
      typeof o.rating0To10 === 'number'
        ? o.rating0To10
        : o.analysis &&
            typeof o.analysis === 'object' &&
            typeof o.analysis.rating0To10 === 'number'
          ? o.analysis.rating0To10
          : o.result && typeof o.result === 'object' && typeof o.result.rating0To10 === 'number'
            ? o.result.rating0To10
            : o.data && typeof o.data === 'object' && typeof o.data.rating0To10 === 'number'
              ? o.data.rating0To10
              : null;
    if (typeof r10 === 'number' && Number.isFinite(r10)) {
      const clamped = Math.max(0, Math.min(10, Math.round(r10)));
      html += `<div style="font-size:13px;font-weight:800;color:#9a3412;margin-bottom:10px;padding:8px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">${escHtml(
        `Classificação: ${clamped}/10`,
      )}</div>`;
    }
    answers.forEach((a, ai) => {
      if (!a || typeof a !== 'object') return;
      const rawAnswerValue =
        a.value !== undefined
          ? a.value
          : a.answer !== undefined
            ? a.answer
            : typeof a.yes === 'boolean'
              ? a.yes
                ? 'yes'
                : 'no'
              : typeof a.count === 'number'
                ? a.count > 0
                  ? 'yes'
                  : 'no'
                : undefined;
      const lab = formatVisionIaAnswerLabel(rawAnswerValue);
      const pct =
        typeof a.confidence === 'number' && Number.isFinite(a.confidence)
          ? Math.round(a.confidence * 100)
          : typeof a.score === 'number' && Number.isFinite(a.score)
            ? Math.round(a.score * 100)
            : typeof a.probability === 'number' && Number.isFinite(a.probability)
              ? Math.round(a.probability * 100)
          : null;
      const q =
        answers.length === 1
          ? escHtml('Resultado da análise')
          : escHtml(String(a.question || a.questionId || `Pergunta ${ai + 1}`));
      const rat = a.rationale != null ? escHtml(String(a.rationale).slice(0, 500)) : '';
      html += `<div style="margin-bottom:8px;font-size:12px"><div style="font-weight:700;color:#334155">${q}</div>`;
      html += `<div style="color:#0f172a;font-weight:800">${escHtml(lab)}${pct != null ? ` · confiança ${pct}%` : ''}</div>`;
      if (rat) {
        html += `<div style="font-size:10px;color:#475569;font-style:italic;margin-top:4px">${rat}</div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  if (!html) return null;
  return html;
}

function parseImageAnnotationPayload(val) {
  const unwrapObj = (input) => {
    let cur = input;
    for (let i = 0; i < 5; i++) {
      if (cur == null) return null;
      if (typeof cur === 'string') {
        const s = cur.trim();
        if (!s || !(s.startsWith('{') || s.startsWith('"'))) return null;
        try {
          cur = JSON.parse(s);
          continue;
        } catch {
          return null;
        }
      }
      if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
        const hasDirectMedia =
          typeof cur.imageUri === 'string' ||
          typeof cur.uri === 'string' ||
          typeof cur.remoteImageUri === 'string' ||
          typeof cur.publicImageUrl === 'string' ||
          Array.isArray(cur.strokes) ||
          Array.isArray(cur.annotations);
        if (hasDirectMedia) return cur;
        const nested = cur.payload ?? cur.value ?? cur.data ?? cur.result;
        if (nested == null) return null;
        cur = nested;
        continue;
      }
      return null;
    }
    return null;
  };

  const o = unwrapObj(val);
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const uri = String(o.imageUri || o.uri || o.remoteImageUri || o.publicImageUrl || o.mediaUrl || '').trim();
  if (!uri) return null;

  const parsePts = (raw) => {
    if (Array.isArray(raw)) {
      return raw
        .map((pt) => {
          if (Array.isArray(pt) && pt.length >= 2) {
            const x = Number(pt[0]);
            const y = Number(pt[1]);
            if (Number.isFinite(x) && Number.isFinite(y)) return { nx: x, ny: y };
          }
          return normStrokePoint(pt);
        })
        .filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      const s = raw.trim();
      if (s.startsWith('[') || s.startsWith('{')) {
        try {
          const j = JSON.parse(s);
          if (Array.isArray(j)) return j.map(normStrokePoint).filter(Boolean);
        } catch {
          /* ignore */
        }
      }
      const parsed = s
        .split('|')
        .map((seg) => seg.trim())
        .filter(Boolean)
        .map((seg) => {
          const [x, y] = seg.split(/[,\s;]+/).map((n) => Number(n));
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { nx: x, ny: y };
        })
        .filter(Boolean);
      return parsed;
    }
    return [];
  };

  const strokesRaw = Array.isArray(o.strokes)
    ? o.strokes
    : Array.isArray(o.annotations)
      ? o.annotations
      : [];
  const strokes = strokesRaw
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const pts = parsePts(s.pts ?? s.points ?? s.pathPoints ?? s.path ?? s.coordinates);
      if (!Array.isArray(pts) || pts.length < 2) return null;
      return { ...s, pts };
    })
    .filter(Boolean);
  const rawSrc = String(o.captureSource || '').trim().toLowerCase();
  const captureSource = rawSrc === 'gallery' || rawSrc === 'camera' ? rawSrc : '';
  const captureLat = o.captureLat != null ? String(o.captureLat).trim() : '';
  const captureLng = o.captureLng != null ? String(o.captureLng).trim() : '';
  const captureAddr = typeof o.captureAddr === 'string' ? o.captureAddr.trim() : '';
  return { uri, strokes, captureSource, captureLat, captureLng, captureAddr };
}

function normStrokePoint(pt) {
  if (!pt || typeof pt !== 'object') return null;
  const nx = Number(pt.nx != null ? pt.nx : pt.x);
  const ny = Number(pt.ny != null ? pt.ny : pt.y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return { nx, ny };
}

function pathFromNormPts(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return '';
  const p0 = pts[0];
  if (!p0) return '';
  let d = `M ${p0.nx} ${p0.ny}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    d += ` L ${p.nx} ${p.ny}`;
  }
  return d;
}

/**
 * Foto com anotações: imagem base + traços SVG (coordenadas normalizadas 0–1).
 * @param {unknown} val
 * @param {(s: string) => string} escHtml
 * @returns {string|null}
 */
export function buildImageAnnotationReportHtml(val, escHtml) {
  const p = parseImageAnnotationPayload(val);
  if (!p) return null;
  const { uri, strokes, captureSource, captureLat, captureLng, captureAddr } = p;
  const httpsUri = pickFirstHttpsMediaUri(uri);
  const hrefEsc = escapeHtmlAttr(httpsUri || uri);
  const safeStroke = (raw) => {
    const s = String(raw || '').trim();
    return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : '#dc2626';
  };

  const rawPtsByStroke = strokes.map((s) =>
    Array.isArray(s.pts) ? s.pts.map(normStrokePoint).filter(Boolean) : []
  );
  const allPts = rawPtsByStroke.flat();
  const allAlreadyNormalized =
    allPts.length > 0 &&
    allPts.every((pt) => pt.nx >= 0 && pt.nx <= 1 && pt.ny >= 0 && pt.ny <= 1);
  let minX = 0;
  let maxX = 1;
  let minY = 0;
  let maxY = 1;
  if (!allAlreadyNormalized && allPts.length > 0) {
    minX = Math.min(...allPts.map((pt) => pt.nx));
    maxX = Math.max(...allPts.map((pt) => pt.nx));
    minY = Math.min(...allPts.map((pt) => pt.ny));
    maxY = Math.max(...allPts.map((pt) => pt.ny));
  }
  const spanX = Math.max(1e-9, maxX - minX);
  const spanY = Math.max(1e-9, maxY - minY);
  const toUnit = (pt) => {
    if (allAlreadyNormalized) {
      return {
        nx: Math.max(0, Math.min(1, pt.nx)),
        ny: Math.max(0, Math.min(1, pt.ny)),
      };
    }
    return {
      nx: Math.max(0, Math.min(1, (pt.nx - minX) / spanX)),
      ny: Math.max(0, Math.min(1, (pt.ny - minY) / spanY)),
    };
  };

  const paths = strokes
    .map((s, si) => {
      const col = safeStroke(s.color);
      /* viewBox 0–1: traços muito finos somem na impressão/PDF; mínimo maior que no ecrã. */
      const swN = Math.max(0.015, Math.min(0.06, (Number(s.width) || 4) / 220));
      const pts = rawPtsByStroke[si].map(toUnit);
      const d = pathFromNormPts(pts);
      if (!d) return '';
      return `<path d="${d}" stroke="${col}" stroke-width="${swN}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('');
  const svgOverlay =
    paths.length > 0
      ? `<svg class="pdf-image-annot-svg" viewBox="0 0 1 1" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="grid-area:1/1;width:100%;height:100%;max-height:320px;min-height:0;justify-self:stretch;align-self:stretch;display:block;pointer-events:none;z-index:1">${paths}</svg>`
      : '';
  let inner;
  if (httpsUri) {
    const srcEsc = escapeHtmlAttr(httpsUri);
    inner = `<div class="pdf-image-annot-stack" style="display:grid;width:100%;max-width:100%;align-items:start;justify-items:stretch;line-height:0">
      <img src="${srcEsc}" alt="" style="grid-area:1/1;width:100%;max-height:320px;height:auto;object-fit:contain;display:block;vertical-align:top" onerror="this.onerror=null;this.src='https://placehold.co/560x320/f1f5f9/64748b?text=Foto+indispon%C3%ADvel'"/>
      ${svgOverlay}
    </div>`;
  } else {
    inner = `<div style="position:relative;max-width:100%;display:inline-block;width:100%">${localMediaUnavailableHtml(escHtml)}${
      paths.length > 0
        ? `<div style="margin-top:10px;font-size:10px;color:#64748b">${escHtml(`Traços registados: ${strokes.length} (pré-visualização da imagem indisponível sem URL pública).`)}</div>`
        : ''
    }</div>`;
  }
  const linkLine = httpsUri
    ? `<div style="font-size:11px;margin-top:6px"><a href="${hrefEsc}" target="_blank" rel="noopener" style="color:#2563eb;font-weight:600">Abrir imagem</a></div>`
    : '';

  if (captureSource === 'gallery') {
    return `${wrapAnnotationGalleryMedia(inner)}${linkLine}`;
  }

  const stampMeta = {
    captureLat: captureLat || undefined,
    captureLng: captureLng || undefined,
    captureAddr: captureAddr || undefined,
  };
  const refUri = httpsUri || uri;
  const timeStamp = visionMediaStampLine(stampMeta, refUri);
  const geoLine = visionMediaGeoStampLine(stampMeta, refUri);
  return `${wrapVisionStampedMedia(inner, timeStamp, escHtml, 'annotation', geoLine)}${linkLine}`;
}

function matrixColumnsFromField(field) {
  const mc = field && field.matrixColumns;
  if (!Array.isArray(mc) || !mc.length) {
    return [
      { id: 'c1', label: 'Item', cellType: 'text' },
      { id: 'c2', label: 'Valor', cellType: 'text' },
    ];
  }
  return mc
    .map((c, i) => {
      const id = String(c?.id || `c${i + 1}`).trim() || `c${i + 1}`;
      const label = String(c?.label || id).trim() || id;
      const ct = String(c?.cellType || 'text').toLowerCase();
      const cellType = ct === 'number' || ct === 'yes_no' ? ct : 'text';
      return { id, label, cellType };
    })
    .slice(0, 8);
}

function parseRepeatableMatrixRows(val) {
  let v = val;
  if (typeof val === 'string' && val.trim()) {
    try {
      v = JSON.parse(val);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
}

function formatMatrixCellHtml(cellVal, cellType, escHtml) {
  if (cellVal === true) return '<span style="color:#15803d;font-weight:800">Sim</span>';
  if (cellVal === false) return '<span style="color:#b91c1c;font-weight:800">Não</span>';
  if (cellVal == null || String(cellVal).trim() === '') return '<span style="color:#94a3b8">—</span>';
  return escHtml(String(cellVal));
}

/**
 * Matriz repetível: tabela HTML a partir de `matrixColumns` e linhas JSON.
 * @param {unknown} val
 * @param {{ matrixColumns?: unknown[] }} field
 * @param {(s: string) => string} escHtml
 * @returns {string|null}
 */
export function buildRepeatableMatrixReportHtml(val, field, escHtml) {
  const rows = parseRepeatableMatrixRows(val);
  if (!rows.length) return null;
  const cols = matrixColumnsFromField(field);
  const thStyle =
    'text-align:left;padding:8px 10px;font-weight:800;font-size:11px;color:#0f766e;border-bottom:2px solid #99f6e4;background:#ecfdf5';
  const tdStyle = 'padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;vertical-align:middle';
  let thead = `<tr>${cols.map((c) => `<th style="${thStyle}">${escHtml(c.label)}</th>`).join('')}</tr>`;
  const body = rows
    .map((row, ri) => {
      const tds = cols
        .map((c) => {
          const raw = row[c.id];
          return `<td style="${tdStyle}">${formatMatrixCellHtml(raw, c.cellType, escHtml)}</td>`;
        })
        .join('');
      return `<tr style="background:${ri % 2 === 0 ? '#fff' : '#f8fafc'}">${tds}</tr>`;
    })
    .join('');
  return `<div style="overflow-x:auto;margin-top:4px">
    <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #99f6e4;border-radius:8px;overflow:hidden;min-width:280px">
      <thead>${thead}</thead>
      <tbody>${body}</tbody>
    </table>
    <div style="font-size:10px;color:#64748b;margin-top:6px;font-weight:600">${escHtml(`${rows.length} linha(s) preenchida(s)`)}</div>
  </div>`;
}
