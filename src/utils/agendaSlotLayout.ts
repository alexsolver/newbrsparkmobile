const MS_PER_DAY = 86400000;
const MINUTES_PER_DAY = 24 * 60;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

export type AgendaTimedSegment = {
  /** Índice da coluna no Gantt (0 = primeiro dia da vista) */
  dayIndex: number;
  /** 0–1 dentro da célula do dia */
  leftFrac: number;
  /** 0–1 dentro da célula do dia */
  widthFrac: number;
};

/**
 * Segmentos horizontais para barra proporcional ao tempo (múltiplos de 5 min no despacho;
 * aqui usamos a duração real em minutos para fração do dia).
 */
export function computeTimedAgendaSegments(
  agendaStartIso: string,
  agendaEndIso: string,
  viewAnchorMidnight: Date,
  maxDays: number
): AgendaTimedSegment[] {
  const start = new Date(agendaStartIso);
  const end = new Date(agendaEndIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
    return [];
  }

  const anchor = startOfLocalDay(viewAnchorMidnight);
  const out: AgendaTimedSegment[] = [];
  let cursor = new Date(start.getTime());

  while (cursor.getTime() < end.getTime()) {
    const dayStart = startOfLocalDay(cursor);
    const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY);
    const segStartMs = cursor.getTime();
    const segEndMs = Math.min(end.getTime(), dayEnd.getTime());
    const dayIndex = Math.round((dayStart.getTime() - anchor.getTime()) / MS_PER_DAY);
    if (dayIndex >= 0 && dayIndex < maxDays && segEndMs > segStartMs) {
      const minsFromMidnight = (segStartMs - dayStart.getTime()) / 60000;
      const durMin = (segEndMs - segStartMs) / 60000;
      const leftFrac = Math.min(1, Math.max(0, minsFromMidnight / MINUTES_PER_DAY));
      const widthFrac = Math.min(1 - leftFrac, Math.max(0, durMin / MINUTES_PER_DAY));
      if (widthFrac > 0) {
        out.push({ dayIndex, leftFrac, widthFrac });
      }
    }
    cursor = new Date(dayEnd.getTime());
  }

  return out;
}
