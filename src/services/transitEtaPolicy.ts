/**
 * ETA no deslocamento: snapshot inicial Google (proxy); realinhamento a cada 10 min
 * (máx. 5 chamadas Google por trecho). Entre refrescos Google: média de 1 km × distância
 * restante na polilinha (via progresso do mapa) ou contagem do relógio até haver 1 km.
 */

/** Intervalo entre tentativas de realinhamento Google (ms). */
export const TRANSIT_ETA_GOOGLE_REFRESH_MS = 10 * 60 * 1000;

/** Máximo de chamadas bem-sucedidas ao proxy Google Routes por trecho. */
export const TRANSIT_ETA_GOOGLE_MAX_CALLS_PER_TRIP = 5;

/** Intervalo para actualizar o ETA mostrado (relógio ou resto ÷ v média). */
export const TRANSIT_ETA_TICK_MS = 20 * 1000;

/** Janela de 1 km para recalcular velocidade média ao longo da polilinha (m). */
export const TRANSIT_ETA_KM_BUCKET_M = 1000;

/** Emissão de progresso do mapa: no máximo cada N ms. */
export const TRANSIT_ETA_PROGRESS_EMIT_MIN_MS = 3500;

/** Emissão se o arco na polilinha mudou pelo menos N m. */
export const TRANSIT_ETA_PROGRESS_EMIT_MIN_ARC_DELTA_M = 90;

/** Velocidade mínima para ETA por resto ÷ v (~5 km/h). */
export const TRANSIT_ETA_MIN_SPEED_MPS = 1.4;

/** Tecto de velocidade média (~162 km/h). */
export const TRANSIT_ETA_MAX_SPEED_MPS = 45;

/**
 * ETA entre snapshots Google, antes da primeira janela de 1 km: ~1 min a menos por minuto real.
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

/** Minutos até ao fim, dados metros restantes na rota e velocidade média (m/s). */
export function computeEtaMinutesFromRemainingMetersAndSpeedMps(
  remainingMeters: number,
  speedMps: number
): number {
  const v = Math.min(
    TRANSIT_ETA_MAX_SPEED_MPS,
    Math.max(TRANSIT_ETA_MIN_SPEED_MPS, Number(speedMps) || TRANSIT_ETA_MIN_SPEED_MPS)
  );
  const sec = remainingMeters / v;
  return Math.max(1, Math.round(sec / 60));
}
