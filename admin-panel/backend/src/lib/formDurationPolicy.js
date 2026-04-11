'use strict';

/** Padrão quando o template não define tempo previsto (minutos). */
const DEFAULT_FORM_DURATION_MIN = 60;
/** Mínimo permitido; duração alinhada a múltiplos de 5 min (agenda). */
const MIN_FORM_DURATION_MIN = 5;
const STEP_MIN = 5;

function roundDownToStep(n, step) {
  return Math.floor(n / step) * step;
}

/**
 * Normaliza minutos previstos de execução do formulário (sem deslocamento).
 * @param {unknown} raw
 * @param {{ allowNull?: boolean }} opts — allowNull: template opcional sem valor → null
 * @returns {number|null}
 */
function normalizeExpectedFormDurationMinutes(raw, opts = {}) {
  const allowNull = !!opts.allowNull;
  if (raw == null || raw === '') {
    return allowNull ? null : DEFAULT_FORM_DURATION_MIN;
  }
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n)) {
    return allowNull ? null : DEFAULT_FORM_DURATION_MIN;
  }
  const clamped = Math.max(MIN_FORM_DURATION_MIN, n);
  return roundDownToStep(clamped, STEP_MIN);
}

/**
 * Resolve minutos efetivos para snapshot na OS (nunca null após despacho).
 * @param {unknown} templateMinutes — de ChecklistTemplate.settings.expectedFormDurationMinutes
 * @param {unknown} overrideMinutes — do payload de despacho
 */
function resolveSnapshotExpectedFormDurationMinutes(templateMinutes, overrideMinutes) {
  const o = normalizeExpectedFormDurationMinutes(overrideMinutes, { allowNull: true });
  if (o != null) return o;
  const t = normalizeExpectedFormDurationMinutes(templateMinutes, { allowNull: true });
  if (t != null) return t;
  return DEFAULT_FORM_DURATION_MIN;
}

function parseScheduledStartAt(isoOrDate) {
  if (isoOrDate == null || String(isoOrDate).trim() === '') return null;
  const d = new Date(isoOrDate);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

module.exports = {
  DEFAULT_FORM_DURATION_MIN,
  MIN_FORM_DURATION_MIN,
  STEP_MIN,
  normalizeExpectedFormDurationMinutes,
  resolveSnapshotExpectedFormDurationMinutes,
  parseScheduledStartAt,
};
