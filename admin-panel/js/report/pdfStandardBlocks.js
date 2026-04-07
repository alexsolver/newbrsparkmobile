/**
 * Fragmentos alinhados ao PDF da Central de Operações (operations.html / printReport).
 */

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
      <div style="font-size:7px;color:#94a3b8;font-style:italic">Sem registo de pausas.</div>
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
