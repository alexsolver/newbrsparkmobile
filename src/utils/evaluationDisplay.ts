/**
 * Mapeamento visual para avaliações (sem expor enums crus na UI).
 */

export type EvalTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function instanceStatusTone(status: string | undefined | null): EvalTone {
  const s = String(status || '').toUpperCase();
  if (s === 'PENDING') return 'warning';
  if (s === 'IN_REVIEW') return 'info';
  if (s === 'RESPONDED') return 'success';
  if (s === 'FINALIZED') return 'neutral';
  return 'neutral';
}

export function disputeStatusTone(status: string | undefined | null): EvalTone {
  const s = String(status || '').toUpperCase();
  if (s === 'PENDING') return 'warning';
  if (s === 'MAINTAIN_EVAL') return 'success';
  if (s === 'ADJUSTED') return 'info';
  if (s === 'INVALIDATED') return 'danger';
  return 'neutral';
}

export function scoreBandTone(band: string | undefined | null): EvalTone {
  const s = String(band || '').toUpperCase();
  if (s === 'EXCELLENT') return 'success';
  if (s === 'GOOD') return 'info';
  if (s === 'CRITICAL') return 'danger';
  return 'neutral';
}

export function actionPlanStatusTone(status: string | undefined | null): EvalTone {
  const s = String(status || '').toUpperCase();
  if (s === 'OPEN') return 'warning';
  if (s === 'IN_PROGRESS') return 'info';
  if (s === 'DONE') return 'success';
  return 'neutral';
}
