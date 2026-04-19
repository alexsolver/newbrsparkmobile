/**
 * Formatação legível de auditoria biométrica (FaceMatch) e de objetos genéricos
 * em relatórios do painel e PDF — evita blocos `<pre>` com JSON bruto.
 */

/** @param {unknown} raw */
export function parseBiometricAudit(raw) {
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

/**
 * Heurística: payload gravado em `{fieldId}__biometric` ou objeto de auditoria facial.
 * @param {unknown} o
 */
export function isBiometricAuditPayload(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const keys = Object.keys(o);
  if (keys.some((k) => k === 'identifiedUser' || k === 'facialAuthMode' || k === 'identifiedUserId')) return true;
  if ('confidence' in o && ('engine' in o || 'at' in o || 'pending' in o)) return true;
  if (typeof o.pending === 'boolean' && ('capturedAt' in o || 'captureAddr' in o || 'captureLat' in o)) return true;
  if (o.engine === 'server' && ('at' in o || 'confidence' in o)) return true;
  return false;
}

function fmtPtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function facialModeLabel(mode) {
  const m = String(mode || '').toLowerCase();
  if (m === 'identify') return 'Identificar utilizador na matrícula';
  if (m === 'self_verify') return 'Verificar identidade do utilizador em sessão';
  return String(mode || '—');
}

function confidenceLabel(c) {
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  const pct = c <= 1 ? c * 100 : Math.min(100, c);
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`;
}

/**
 * Tabela legível — painel (usa var(--border)) ou PDF (cores explícitas em opts).
 * @param {unknown} audit
 * @param {(s: string) => string} esc
 * @param {{ borderColor?: string; forPdf?: boolean }} [opts]
 */
export function formatBiometricAuditDetailHtml(audit, esc, opts = {}) {
  const o = parseBiometricAudit(audit);
  if (!o || typeof o !== 'object') {
    return `<span style="color:#94a3b8;font-style:italic">(sem dados de auditoria)</span>`;
  }
  const border = opts.borderColor || (opts.forPdf ? '#e2e8f0' : 'var(--border)');
  const bg = opts.forPdf ? '#f8fafc' : 'var(--surface)';
  const conf = confidenceLabel(o.confidence);
  const iu = o.identifiedUser && typeof o.identifiedUser === 'object' ? o.identifiedUser : null;
  let estado = 'Registado';
  if (o.pending === true) estado = 'Pendente de validação';
  else if (o.deferredValidationFailed === true) estado = 'Validação não concluída';
  else if (conf) estado = 'Validado';

  /** @type {Array<[string, string]>} */
  const rows = [];
  rows.push(['Estado', esc(estado)]);
  if (conf) rows.push(['Confiança', esc(conf)]);
  if (o.engine != null && String(o.engine).trim() !== '') rows.push(['Motor', esc(String(o.engine))]);
  if (o.facialAuthMode) rows.push(['Modo facial', esc(facialModeLabel(o.facialAuthMode))]);
  if (iu) {
    if (iu.name != null && String(iu.name).trim() !== '') rows.push(['Identificado (nome)', esc(String(iu.name))]);
    if (iu.email != null && String(iu.email).trim() !== '') rows.push(['E-mail', esc(String(iu.email))]);
    if (iu.role != null && String(iu.role).trim() !== '') rows.push(['Papel', esc(String(iu.role))]);
  }
  if (o.identifiedUserId != null && String(o.identifiedUserId).trim() !== '') {
    rows.push(['ID do utilizador', esc(String(o.identifiedUserId))]);
  }
  if (o.capturedAt) rows.push(['Captura (imagem)', esc(fmtPtDateTime(o.capturedAt))]);
  if (o.at) rows.push(['Validação no servidor', esc(fmtPtDateTime(o.at))]);
  if (o.captureLat != null && o.captureLng != null && Number.isFinite(Number(o.captureLat)) && Number.isFinite(Number(o.captureLng))) {
    rows.push([
      'GPS (captura)',
      esc(`${Number(o.captureLat).toFixed(5)}, ${Number(o.captureLng).toFixed(5)}`),
    ]);
  }
  if (o.captureAddr != null && String(o.captureAddr).trim() !== '') {
    rows.push(['Endereço (captura)', esc(String(o.captureAddr))]);
  }

  const tbody = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 10px;border-bottom:1px solid ${border};font-weight:700;color:#334155;vertical-align:top;width:38%">${esc(k)}</td><td style="padding:8px 10px;border-bottom:1px solid ${border};line-height:1.45;color:#0f172a">${v}</td></tr>`,
    )
    .join('');
  return `<div style="overflow-x:auto;margin-top:6px;border-radius:8px;border:1px solid ${border};background:${bg}"><table style="width:100%;border-collapse:collapse;font-size:12px"><tbody>${tbody}</tbody></table></div>`;
}

/**
 * Objeto genérico → tabela chave / valor (recursivo limitado). Nunca devolve JSON.stringify bruto.
 * @param {unknown} val
 * @param {(s: string) => string} esc
 * @param {number} [depth]
 * @param {{ maxDepth?: number; borderColor?: string }} [opts]
 */
export function formatStructuredValueForReportHtml(val, esc, depth = 0, opts = {}) {
  const maxDepth = opts.maxDepth != null ? opts.maxDepth : 8;
  const border = opts.borderColor || '#e2e8f0';

  if (depth > maxDepth) {
    return `<span style="color:#94a3b8">…</span>`;
  }
  if (val == null) return `<span style="color:#94a3b8">—</span>`;
  if (typeof val === 'boolean') {
    return val ? '<span style="font-weight:700;color:#15803d">Sim</span>' : '<span style="font-weight:700;color:#b91c1c">Não</span>';
  }
  if (typeof val === 'number' && Number.isFinite(val)) return esc(String(val));
  if (typeof val === 'string') {
    const t = val.length > 2000 ? `${val.slice(0, 2000)}…` : val;
    return esc(t);
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return `<span style="color:#94a3b8">(lista vazia)</span>`;
    const items = val
      .map(
        (item, i) =>
          `<li style="margin:4px 0">${formatStructuredValueForReportHtml(item, esc, depth + 1, opts)}</li>`,
      )
      .join('');
    return `<ol style="margin:4px 0;padding-left:20px;line-height:1.45">${items}</ol>`;
  }
  if (typeof val === 'object') {
    if (isBiometricAuditPayload(val)) {
      return formatBiometricAuditDetailHtml(val, esc, { forPdf: true, borderColor: border });
    }
    const keys = Object.keys(val);
    if (keys.length === 0) return `<span style="color:#94a3b8">(objeto vazio)</span>`;
    const rows = keys
      .map((k) => {
        const cell = formatStructuredValueForReportHtml(val[k], esc, depth + 1, opts);
        return `<tr><td style="padding:6px 10px;border-bottom:1px solid ${border};font-weight:600;color:#475569;vertical-align:top;max-width:42%">${esc(k)}</td><td style="padding:6px 10px;border-bottom:1px solid ${border};line-height:1.45">${cell}</td></tr>`;
      })
      .join('');
    return `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px;border:1px solid ${border};border-radius:8px;overflow:hidden"><tbody>${rows}</tbody></table>`;
  }
  return esc(String(val));
}
