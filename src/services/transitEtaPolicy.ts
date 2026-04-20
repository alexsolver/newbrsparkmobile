/**
 * ETA no deslocamento: Google Routes (proxy) com cadência baixa + contagem regressiva no relógio entre refreshes.
 */

/** Intervalo entre pedidos Google ao destino (ms). */
export const TRANSIT_ETA_GOOGLE_REFRESH_MS = 7 * 60 * 1000;

/** Máximo de chamadas ao proxy Google Routes por trecho de deslocamento (operacional). */
export const TRANSIT_ETA_GOOGLE_MAX_CALLS_PER_TRIP = 5;

/** Intervalo para atualizar o número mostrado (contagem do relógio). */
export const TRANSIT_ETA_TICK_MS = 20 * 1000;

/**
 * ETA exibido entre refreshes: diminui ~1 min por minuto real a partir do último snapshot.
 */
export function computeTickingEtaMinutes(
  snapshotAtMs: number,
  remainingMinutesAtSnapshot: number,
  nowMs: number
): number {
  const elapsedMin = (nowMs - snapshotAtMs) / 60000;
  const v = remainingMinutesAtSnapshot - elapsedMin;
  return Math.max(1, Math.round(v));
}
