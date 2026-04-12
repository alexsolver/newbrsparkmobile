/** Tipos de batida considerados no cálculo de jornada trabalhada no dia. */
const KNOWN = new Set(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']);

export function deviceLocalDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizePunchType(raw: string | undefined | null): string {
  const t = String(raw || '').toUpperCase();
  return KNOWN.has(t) ? t : '';
}

/**
 * Soma milissegundos em períodos `CLOCK_IN`→`BREAK_START`/`CLOCK_OUT` e `BREAK_END`→…
 * Lista já ordenada por `deviceTimestamp` ascendente.
 */
export function accumulatedWorkedMsFromSortedChronological(
  sorted: readonly { deviceTimestamp: string; type: string }[]
): number {
  type Phase = 'out' | 'in' | 'break';
  let phase: Phase = 'out';
  let segmentStart: number | null = null;
  let total = 0;

  for (const row of sorted) {
    const ty = normalizePunchType(row.type);
    if (!ty) continue;
    const t = new Date(row.deviceTimestamp).getTime();
    if (Number.isNaN(t)) continue;

    switch (ty) {
      case 'CLOCK_IN':
        phase = 'in';
        segmentStart = t;
        break;
      case 'CLOCK_OUT':
        if (phase === 'in' && segmentStart != null) total += Math.max(0, t - segmentStart);
        phase = 'out';
        segmentStart = null;
        break;
      case 'BREAK_START':
        if (phase === 'in' && segmentStart != null) {
          total += Math.max(0, t - segmentStart);
          segmentStart = null;
        }
        phase = 'break';
        break;
      case 'BREAK_END':
        if (phase === 'break') {
          phase = 'in';
          segmentStart = t;
        }
        break;
      default:
        break;
    }
  }
  return total;
}

/**
 * Jornada trabalhada acumulada no mesmo dia civil local do `pivot`, até e incluindo essa batida.
 */
export function accumulatedWorkedMsAtPunchLocalDay<T extends { deviceTimestamp: string; type: string }>(
  all: readonly T[],
  pivot: T
): number {
  const pivotTs = new Date(pivot.deviceTimestamp).getTime();
  if (Number.isNaN(pivotTs)) return 0;
  const dk = deviceLocalDayKey(pivot.deviceTimestamp);
  if (!dk) return 0;
  const subset = all
    .filter((x) => deviceLocalDayKey(x.deviceTimestamp) === dk)
    .filter((x) => new Date(x.deviceTimestamp).getTime() <= pivotTs)
    .sort((a, b) => new Date(a.deviceTimestamp).getTime() - new Date(b.deviceTimestamp).getTime());
  return accumulatedWorkedMsFromSortedChronological(subset);
}

/** Ex.: 4h32 (horas sem zero à esquerda; minutos com dois dígitos). */
export function formatWorkedHm(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export type PunchRecordTone = 'success' | 'caution';

export function punchRecordStatusTone(p: {
  syncPending?: boolean;
  exceptionRegistration?: boolean | null;
  faceEnrollmentInvalid?: boolean | null;
}): PunchRecordTone {
  if (p.syncPending) return 'caution';
  if (p.exceptionRegistration) return 'caution';
  if (p.faceEnrollmentInvalid === true) return 'caution';
  return 'success';
}
