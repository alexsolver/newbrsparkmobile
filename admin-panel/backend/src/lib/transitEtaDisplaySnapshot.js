'use strict';

/** Metadados gravados pelo app (mesmo snapshot do mapa do técnico) para o link público aplicar o mesmo relógio. */
const TRANSIT_ETA_DISPLAY_SNAPSHOT_AT = 'transitEtaDisplaySnapshotAt';
const TRANSIT_ETA_DISPLAY_REMAINING_MIN = 'transitEtaDisplayRemainingMin';

/** Acima disto o link público volta a usar `execution.etaMinutes` (OSRM / servidor). */
const TRANSIT_ETA_DISPLAY_MAX_AGE_MS = 12 * 60 * 1000;

function computeTickingEtaMinutes(snapshotAtMs, remainingMinutesAtSnapshot, nowMs) {
  const elapsedMin = (nowMs - snapshotAtMs) / 60000;
  const v = remainingMinutesAtSnapshot - elapsedMin;
  return Math.max(1, Math.round(v));
}

function stripTransitEtaDisplayFields(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;
  delete meta[TRANSIT_ETA_DISPLAY_SNAPSHOT_AT];
  delete meta[TRANSIT_ETA_DISPLAY_REMAINING_MIN];
}

/**
 * @param {object|null|undefined} meta
 * @param {number} nowMs
 * @returns {number|null} minutos para exibir; null se deve usar o fallback do servidor
 */
function resolveDisplayEtaMinutesFromMeta(meta, nowMs) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const rawAt = meta[TRANSIT_ETA_DISPLAY_SNAPSHOT_AT];
  const rawRem = meta[TRANSIT_ETA_DISPLAY_REMAINING_MIN];
  const snapMs = typeof rawAt === 'string' ? Date.parse(rawAt) : NaN;
  const rem = typeof rawRem === 'number' ? rawRem : Number(rawRem);
  if (!Number.isFinite(snapMs) || !Number.isFinite(rem) || rem < 1) return null;
  if (nowMs - snapMs > TRANSIT_ETA_DISPLAY_MAX_AGE_MS || snapMs > nowMs + 120000) return null;
  return computeTickingEtaMinutes(snapMs, rem, nowMs);
}

module.exports = {
  TRANSIT_ETA_DISPLAY_SNAPSHOT_AT,
  TRANSIT_ETA_DISPLAY_REMAINING_MIN,
  TRANSIT_ETA_DISPLAY_MAX_AGE_MS,
  computeTickingEtaMinutes,
  stripTransitEtaDisplayFields,
  resolveDisplayEtaMinutesFromMeta,
};
