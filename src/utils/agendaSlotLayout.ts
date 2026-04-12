const MS_PER_DAY = 86400000;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Interpreta `YYYY-MM-DD` à meia-noite **local** (evita o parse UTC de `new Date('YYYY-MM-DD')`,
 * que desloca o dia civil em fusos como America/Sao_Paulo e faz o Gantt descartar todos os eventos).
 */
export function parseAgendaYmdLocal(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return new Date(NaN);
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  return new Date(y, mo, d, 0, 0, 0, 0);
}

/** Fim do dia civil local para `YYYY-MM-DD` (23:59:59.999). */
export function endOfAgendaYmdLocal(ymd: string): Date {
  const x = parseAgendaYmdLocal(ymd);
  if (!Number.isFinite(x.getTime())) return x;
  x.setHours(23, 59, 59, 999);
  return x;
}

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

/** Intervalo em ms para detetar sobreposição entre eventos na mesma linha do Gantt. */
export type AgendaEventInterval = {
  eventId: string;
  startMs: number;
  endMs: number;
};

/**
 * Constrói intervalos a partir de `AgendaEvent` (bloco com hora ou intervalo de datas).
 */
export function buildAgendaEventIntervals(events: { id: string; startDate: string; endDate: string; agendaStartAt?: string | null; agendaEndAt?: string | null }[]): AgendaEventInterval[] {
  const out: AgendaEventInterval[] = [];
  for (const ev of events) {
    if (ev.agendaStartAt && ev.agendaEndAt) {
      const s = new Date(ev.agendaStartAt).getTime();
      const e = new Date(ev.agendaEndAt).getTime();
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
        out.push({ eventId: ev.id, startMs: s, endMs: e });
      }
      continue;
    }
    const sDate = parseAgendaYmdLocal(ev.startDate);
    const eDate = endOfAgendaYmdLocal(ev.endDate);
    const s = sDate.getTime();
    const e = eDate.getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
      out.push({ eventId: ev.id, startMs: s, endMs: e });
    }
  }
  return out;
}

/**
 * Atribui faixas verticais (0, 1, …) para que eventos com intervalos sobrepostos não partilhem a mesma faixa.
 * Ordenação por início; greedy: primeira faixa em que o último `end` é ≤ `start` do evento atual.
 */
export function assignNonOverlappingLanes(intervals: AgendaEventInterval[]): { laneByEventId: Map<string, number>; laneCount: number } {
  if (intervals.length === 0) {
    return { laneByEventId: new Map(), laneCount: 1 };
  }
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const laneEnds: number[] = [];
  const laneByEventId = new Map<string, number>();
  for (const inv of sorted) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] > inv.startMs) {
      lane++;
    }
    if (lane === laneEnds.length) {
      laneEnds.push(inv.endMs);
    } else {
      laneEnds[lane] = inv.endMs;
    }
    laneByEventId.set(inv.eventId, lane);
  }
  return { laneByEventId, laneCount: Math.max(1, laneEnds.length) };
}

/** Duração de cada slot na vista «HOJE» (minutos). */
export const AGENDA_DAY_SLOT_MINUTES = 5;

/** Número de slots num dia civil (24 h). */
export const AGENDA_DAY_SLOT_COUNT = (24 * 60) / AGENDA_DAY_SLOT_MINUTES;

/**
 * Intersecta o evento com o dia civil local de `dayMidnight` (00:00 desse dia).
 * Devolve `null` se o evento não tocar nesse dia.
 */
export function clipAgendaEventToLocalCalendarDay(
  ev: { id: string; startDate: string; endDate: string; agendaStartAt?: string | null; agendaEndAt?: string | null },
  dayMidnight: Date,
): AgendaEventInterval | null {
  const dayStart = startOfLocalDay(dayMidnight);
  const dayEnd = dayStart.getTime() + MS_PER_DAY;

  if (ev.agendaStartAt && ev.agendaEndAt) {
    const s0 = new Date(ev.agendaStartAt).getTime();
    const e0 = new Date(ev.agendaEndAt).getTime();
    if (!Number.isFinite(s0) || !Number.isFinite(e0) || e0 <= s0) return null;
    const s = Math.max(s0, dayStart.getTime());
    const e = Math.min(e0, dayEnd);
    if (e <= s) return null;
    return { eventId: ev.id, startMs: s, endMs: e };
  }

  const sDate = parseAgendaYmdLocal(ev.startDate);
  const eDate = endOfAgendaYmdLocal(ev.endDate);
  const s0 = sDate.getTime();
  const e0 = eDate.getTime();
  if (!Number.isFinite(s0) || !Number.isFinite(e0) || e0 < dayStart.getTime() || s0 >= dayEnd) return null;
  const s = Math.max(s0, dayStart.getTime());
  const e = Math.min(e0, dayEnd);
  if (e <= s) return null;
  return { eventId: ev.id, startMs: s, endMs: e };
}

/**
 * Intersecta o evento com a janela [meia-noite de `windowStart`, `windowStart` + `numDays` dias).
 */
export function clipAgendaEventToLocalCalendarWindow(
  ev: { id: string; startDate: string; endDate: string; agendaStartAt?: string | null; agendaEndAt?: string | null },
  windowStartMidnight: Date,
  numDays: number,
): AgendaEventInterval | null {
  const w0 = startOfLocalDay(windowStartMidnight);
  const w1 = w0.getTime() + numDays * MS_PER_DAY;

  if (ev.agendaStartAt && ev.agendaEndAt) {
    const s0 = new Date(ev.agendaStartAt).getTime();
    const e0 = new Date(ev.agendaEndAt).getTime();
    if (!Number.isFinite(s0) || !Number.isFinite(e0) || e0 <= s0) return null;
    const s = Math.max(s0, w0.getTime());
    const e = Math.min(e0, w1);
    if (e <= s) return null;
    return { eventId: ev.id, startMs: s, endMs: e };
  }

  const sDate = parseAgendaYmdLocal(ev.startDate);
  const eDate = endOfAgendaYmdLocal(ev.endDate);
  const s0 = sDate.getTime();
  const e0 = eDate.getTime();
  if (!Number.isFinite(s0) || !Number.isFinite(e0) || e0 < w0.getTime() || s0 >= w1) return null;
  const s = Math.max(s0, w0.getTime());
  const e = Math.min(e0, w1);
  if (e <= s) return null;
  return { eventId: ev.id, startMs: s, endMs: e };
}
