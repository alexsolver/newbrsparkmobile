/**
 * Formato gravado em applyMaterialsStockOnSubmit:
 * CHK:{templateId}:TASK:{taskId}:REV:{R}[:FT:{numeroFT}]:FLD:{fieldId}{rowSuffix}[:ADJ]
 * (:FT: opcional desde que passemos osNumber na submissão; legado sem :FT: continua válido)
 */
export function parseTechStockReason(reason?: string | null): {
  templateId?: string;
  taskId?: string;
  revision?: number;
  ftNumber?: string;
  fieldId?: string;
  isAdjustment?: boolean;
} {
  if (!reason || typeof reason !== 'string') return {};
  const isAdjustment = reason.endsWith(':ADJ');
  const core = isAdjustment ? reason.slice(0, -4) : reason;
  const m = core.match(/^CHK:([^:]+):TASK:([^:]+):REV:(\d+)(?::FT:([^:]+))?:FLD:(.+)$/);
  if (!m) return { isAdjustment };
  return {
    templateId: m[1],
    taskId: m[2],
    revision: Number(m[3]),
    ftNumber: m[4] || undefined,
    fieldId: m[5],
    isAdjustment,
  };
}

export type TaskRef = { title?: string; osNumber?: string | null };

export function labelForTechStockMovement(
  reason: string | undefined | null,
  taskById: Map<string, TaskRef>,
): string {
  const p = parseTechStockReason(reason);
  if (!p.taskId) {
    if (reason && String(reason).trim()) return 'Movimentação registrada';
    return '—';
  }
  const t = taskById.get(p.taskId);
  const ftFromReason = p.ftNumber != null && String(p.ftNumber).trim() !== '' ? String(p.ftNumber).trim() : null;
  const numFromTask =
    t?.osNumber != null && String(t.osNumber).trim() !== '' ? String(t.osNumber).trim() : null;
  const num = ftFromReason || numFromTask;
  const title = t?.title != null && String(t.title).trim() !== '' ? String(t.title).trim() : null;
  if (num && title) return `FT ${num} — ${title}`;
  if (num) return `FT ${num}`;
  if (title) return title;
  return `Ref. técnica ${p.taskId.slice(0, 8)}…`;
}
