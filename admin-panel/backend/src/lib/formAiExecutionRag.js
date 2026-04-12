'use strict';

const prisma = require('../db');

const SECTION_REPEAT_PREFIX = '__section_repeat_';

/**
 * @param {string | null | undefined} id
 * @returns {string | null}
 */
function safeTemplateId(id) {
  if (id == null) return null;
  const s = String(id).trim();
  if (!s || s.length > 120) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

/**
 * @param {unknown} schemaData
 * @returns {Map<string, string>}
 */
function buildFieldLabelMap(schemaData) {
  const m = new Map();
  if (!Array.isArray(schemaData)) return m;
  for (const f of schemaData) {
    if (!f || typeof f !== 'object' || !f.id) continue;
    const id = String(f.id);
    const lab = f.label != null ? String(f.label).trim().slice(0, 200) : id;
    m.set(id, lab || id);
  }
  return m;
}

/**
 * @param {unknown} val
 * @returns {string | null}
 */
function summarizeValue(val) {
  if (val == null) return null;
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'string') {
    const t = val.trim();
    if (!t) return null;
    if (t.startsWith('data:') || t.length > 4000 || /^[A-Za-z0-9+/=\s]{800,}$/.test(t)) {
      return '[mídia ou conteúdo longo omitido]';
    }
    if (/^https?:\/\//i.test(t) && t.length > 120) {
      return '[URL]';
    }
    return t.length > 320 ? t.slice(0, 320) + '…' : t;
  }
  if (Array.isArray(val)) {
    const bits = val
      .slice(0, 12)
      .map((x) => summarizeValue(x))
      .filter(Boolean);
    if (!bits.length) return null;
    const j = bits.join('; ');
    return j.length > 400 ? j.slice(0, 400) + '…' : j;
  }
  if (typeof val === 'object') {
    try {
      const j = JSON.stringify(val);
      if (!j || j === '{}') return null;
      return j.length > 500 ? j.slice(0, 500) + '…' : j;
    } catch {
      return '[objeto]';
    }
  }
  return null;
}

/**
 * @param {Record<string, unknown>} responses
 * @param {Map<string, string>} labelById
 * @returns {string[]}
 */
function responsesToLines(responses, labelById) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return [];
  const lines = [];
  for (const [k, v] of Object.entries(responses)) {
    if (k.startsWith('__pause')) continue;
    if (k === 'pauseHistory' || k === 'PAUSE_HISTORY') continue;
    if (k.startsWith(SECTION_REPEAT_PREFIX)) {
      const secId = k.slice(SECTION_REPEAT_PREFIX.length);
      const secLabel = labelById.get(secId) || secId;
      if (!Array.isArray(v)) continue;
      v.slice(0, 6).forEach((row, idx) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return;
        for (const [fk, fv] of Object.entries(row)) {
          if (fk.startsWith('_')) continue;
          const lab = labelById.get(fk) || fk;
          const s = summarizeValue(fv);
          if (s) lines.push(`  · [${secLabel} linha ${idx + 1}] ${lab}: ${s}`);
        }
      });
      continue;
    }
    if (k.startsWith('_')) continue;
    const lab = labelById.get(k) || k;
    const s = summarizeValue(v);
    if (s) lines.push(`  · ${lab}: ${s}`);
  }
  return lines;
}

/**
 * Recupera revisões concluídas do mesmo modelo e devolve texto para o system prompt (RAG leve).
 * @param {{
 *   templateId: string,
 *   schemaData?: object[],
 *   maxRevisions?: number,
 *   maxChars?: number,
 * }} opts
 * @returns {Promise<{ text: string, meta: { revisionCount: number, skipped?: string, truncated?: boolean } }>}
 */
async function buildFilledFormsRagContext(opts) {
  const templateId = safeTemplateId(opts.templateId);
  const maxRevisions = Math.min(20, Math.max(1, opts.maxRevisions ?? 10));
  const maxChars = Math.min(24_000, Math.max(2000, opts.maxChars ?? 14_000));
  const labelById = buildFieldLabelMap(opts.schemaData);

  if (!templateId) {
    return { text: '', meta: { revisionCount: 0, skipped: 'invalid_template_id' } };
  }

  try {
    const tpl = await prisma.checklistTemplate.findFirst({
      where: { id: templateId, isActive: true },
      select: { id: true },
    });
    if (!tpl) {
      return { text: '', meta: { revisionCount: 0, skipped: 'template_not_found' } };
    }

    const revisions = await prisma.checklistExecutionRevision.findMany({
      where: {
        completedAt: { not: null },
        execution: { templateId },
      },
      orderBy: { completedAt: 'desc' },
      take: maxRevisions,
      select: {
        revision: true,
        completedAt: true,
        responses: true,
        execution: { select: { id: true, osNumber: true } },
      },
    });

    const parts = [];
    let used = 0;
    for (const rev of revisions) {
      const resp =
        rev.responses && typeof rev.responses === 'object' && !Array.isArray(rev.responses)
          ? /** @type {Record<string, unknown>} */ (rev.responses)
          : null;
      if (!resp || !Object.keys(resp).length) continue;

      const os = rev.execution?.osNumber != null ? String(rev.execution.osNumber).trim() : '';
      const when = rev.completedAt ? new Date(rev.completedAt).toISOString().slice(0, 16) : '—';
      const lines = responsesToLines(resp, labelById);
      if (!lines.length) continue;

      const header = `Preenchimento #${used + 1} (rev. ${rev.revision}, OS ${os || '—'}, ${when})`;
      const body = lines.join('\n').slice(0, 3500);
      const chunk = `${header}\n${body}`;

      const next = parts.length ? parts.join('\n\n—\n\n') + '\n\n—\n\n' + chunk : chunk;
      if (next.length > maxChars) break;
      parts.push(chunk);
      used++;
    }

    if (!parts.length) {
      return { text: '', meta: { revisionCount: 0, skipped: 'no_completed_revisions' } };
    }

    const intro =
      '### Preenchimentos anteriores deste modelo (RAG — amostra)\n' +
      'Use como base de hábitos reais: valores frequentes, listas efetivamente usadas, campos muitas vezes vazios ou sempre preenchidos. ' +
      'Não reproduza dados identificáveis de pessoas; trate como padrões agregados. Se o pedido não depender disto, ignore.\n\n';

    const text = (intro + parts.join('\n\n—\n\n')).slice(0, maxChars);
    return {
      text,
      meta: {
        revisionCount: used,
        truncated: intro.length + parts.join('\n\n—\n\n').length > maxChars,
      },
    };
  } catch (e) {
    console.warn('[formAiExecutionRag]', e && e.message ? e.message : e);
    return { text: '', meta: { revisionCount: 0, skipped: 'query_error' } };
  }
}

module.exports = {
  buildFilledFormsRagContext,
  safeTemplateId,
};
