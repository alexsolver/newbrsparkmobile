import type { WorkTimePunchRow, WorkTimePunchType } from '../services/workTimeService';

const KNOWN: ReadonlySet<string> = new Set(['CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END']);

export type WorkTimeJourneyPhase = 'idle_out' | 'in_work' | 'on_break';

/**
 * Tipos de batida desde a última `CLOCK_OUT` (sessão corrente), mais antigas primeiro.
 * Assim, após uma saída, o fluxo volta a exigir nova entrada.
 */
export function getSessionPunchTypesChronological(punches: WorkTimePunchRow[]): WorkTimePunchType[] {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.deviceTimestamp).getTime() - new Date(b.deviceTimestamp).getTime()
  );
  let start = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (String(sorted[i].type || '').toUpperCase() === 'CLOCK_OUT') {
      start = i + 1;
      break;
    }
  }
  const out: WorkTimePunchType[] = [];
  for (let i = start; i < sorted.length; i++) {
    const t = String(sorted[i].type || '').toUpperCase();
    if (KNOWN.has(t)) out.push(t as WorkTimePunchType);
  }
  return out;
}

/** Estado da jornada após reproduzir a sequência da sessão. */
export function journeyPhaseFromPunchSequence(seq: WorkTimePunchType[]): WorkTimeJourneyPhase {
  let phase: WorkTimeJourneyPhase = 'idle_out';
  for (const raw of seq) {
    const t = String(raw).toUpperCase() as WorkTimePunchType;
    switch (t) {
      case 'CLOCK_IN':
        phase = 'in_work';
        break;
      case 'CLOCK_OUT':
        phase = 'idle_out';
        break;
      case 'BREAK_START':
        if (phase === 'in_work') phase = 'on_break';
        break;
      case 'BREAK_END':
        if (phase === 'on_break') phase = 'in_work';
        break;
      default:
        break;
    }
  }
  return phase;
}

export function enabledPunchTypesForPhase(phase: WorkTimeJourneyPhase): Record<WorkTimePunchType, boolean> {
  switch (phase) {
    case 'idle_out':
      return {
        CLOCK_IN: true,
        CLOCK_OUT: false,
        BREAK_START: false,
        BREAK_END: false,
      };
    case 'in_work':
      return {
        CLOCK_IN: false,
        CLOCK_OUT: true,
        BREAK_START: true,
        BREAK_END: false,
      };
    case 'on_break':
      return {
        CLOCK_IN: false,
        CLOCK_OUT: false,
        BREAK_START: false,
        BREAK_END: true,
      };
    default:
      return {
        CLOCK_IN: true,
        CLOCK_OUT: false,
        BREAK_START: false,
        BREAK_END: false,
      };
  }
}

export function computeJourneyUiState(punches: WorkTimePunchRow[]): {
  phase: WorkTimeJourneyPhase;
  enabled: Record<WorkTimePunchType, boolean>;
} {
  const seq = getSessionPunchTypesChronological(punches);
  const phase = journeyPhaseFromPunchSequence(seq);
  return { phase, enabled: enabledPunchTypesForPhase(phase) };
}
