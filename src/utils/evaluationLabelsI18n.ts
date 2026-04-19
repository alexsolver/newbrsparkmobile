import type { TFunction } from 'i18next';

export function trInstanceStatus(t: TFunction, status: string | undefined | null) {
  const k = String(status || 'UNKNOWN').toUpperCase();
  return t(`productivity.instanceStatus.${k}`, { defaultValue: t('productivity.instanceStatus.UNKNOWN') });
}

export function trDisputeStatus(t: TFunction, status: string | undefined | null) {
  const k = String(status || 'UNKNOWN').toUpperCase();
  return t(`productivity.disputeStatus.${k}`, { defaultValue: t('productivity.disputeStatus.UNKNOWN') });
}

export function trScoreBand(t: TFunction, band: string | undefined | null) {
  const k = String(band || 'UNKNOWN').toUpperCase();
  return t(`productivity.scoreBand.${k}`, { defaultValue: t('productivity.scoreBand.UNKNOWN') });
}

export function trActionPlanStatus(t: TFunction, status: string | undefined | null) {
  const k = String(status || 'UNKNOWN').toUpperCase();
  return t(`productivity.actionPlanStatus.${k}`, { defaultValue: t('productivity.actionPlanStatus.UNKNOWN') });
}
