'use strict';

/**
 * Política de GPS por tenant (app móvel: capturas pontuais, trilha de deslocamento, aquecimento).
 * Persistida em `CollectionPolicy.gpsCapturePolicy` (JSON), política de coleta de dados.
 */

const GPS_CAPTURE_POLICY_DEFAULTS = {
  schemaVersion: 1,
  /** `high_only` = só Accuracy.High (pode demorar). `high_then_balanced` = timeout e fallback Balanced. */
  accuracyMode: 'high_then_balanced',
  /** Milissegundos a aguardar High antes de fallback (só se accuracyMode = high_then_balanced). */
  highAccuracyTimeoutMs: 8000,
  /**
   * Velocidade implícita máxima entre amostras consecutivas da trilha (m/s). Amostras acima são ignoradas.
   * `null` ou `0` = desligado.
   */
  trailOutlierMaxSpeedMps: 45,
  /**
   * Ignorar amostras com `accuracy` horizontal acima deste valor (metros). `null` = desligado.
   */
  trailIgnoreAccuracyAboveM: null,
  /** Watch Balanced enquanto o checklist da OS está em foco (aquecimento GNSS). */
  warmupBalancedWhileChecklistFocused: true,
};

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function normalizeGpsCapturePolicy(raw) {
  const base = { ...GPS_CAPTURE_POLICY_DEFAULTS };
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.schemaVersion != null) {
    const v = parseInt(String(o.schemaVersion), 10);
    if (Number.isFinite(v) && v > 0) base.schemaVersion = v;
  }
  const mode = String(o.accuracyMode || '').toLowerCase();
  if (mode === 'high_only' || mode === 'high_then_balanced') {
    base.accuracyMode = mode;
  }
  const ht = parseInt(String(o.highAccuracyTimeoutMs ?? ''), 10);
  if (Number.isFinite(ht) && ht >= 2000 && ht <= 120000) {
    base.highAccuracyTimeoutMs = ht;
  }
  const spd = o.trailOutlierMaxSpeedMps;
  if (spd === null || spd === '') {
    base.trailOutlierMaxSpeedMps = null;
  } else {
    const n = Number(spd);
    if (Number.isFinite(n) && n >= 0 && n <= 200) {
      base.trailOutlierMaxSpeedMps = n <= 0 ? null : n;
    }
  }
  const accIgn = o.trailIgnoreAccuracyAboveM;
  if (accIgn === null || accIgn === '') {
    base.trailIgnoreAccuracyAboveM = null;
  } else {
    const n = parseInt(String(accIgn), 10);
    if (Number.isFinite(n) && n >= 5 && n <= 500) {
      base.trailIgnoreAccuracyAboveM = n;
    }
  }
  if (typeof o.warmupBalancedWhileChecklistFocused === 'boolean') {
    base.warmupBalancedWhileChecklistFocused = o.warmupBalancedWhileChecklistFocused;
  }
  return base;
}

/**
 * Valida corpo PATCH (objeto parcial) e devolve objeto a gravar em JSON.
 * @param {unknown} body
 * @returns {Record<string, unknown>}
 */
function validateGpsCapturePolicyPatch(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('gpsCapturePolicy deve ser um objeto.');
  }
  const src = /** @type {Record<string, unknown>} */ (body);
  const out = {};
  if (Object.prototype.hasOwnProperty.call(src, 'accuracyMode')) {
    const m = String(src.accuracyMode || '').toLowerCase();
    if (m !== 'high_only' && m !== 'high_then_balanced') {
      throw new Error('accuracyMode: use high_only ou high_then_balanced.');
    }
    out.accuracyMode = m;
  }
  if (Object.prototype.hasOwnProperty.call(src, 'highAccuracyTimeoutMs')) {
    const n = parseInt(String(src.highAccuracyTimeoutMs), 10);
    if (!Number.isFinite(n) || n < 2000 || n > 120000) {
      throw new Error('highAccuracyTimeoutMs entre 2000 e 120000.');
    }
    out.highAccuracyTimeoutMs = n;
  }
  if (Object.prototype.hasOwnProperty.call(src, 'trailOutlierMaxSpeedMps')) {
    const v = src.trailOutlierMaxSpeedMps;
    if (v === null || v === '') {
      out.trailOutlierMaxSpeedMps = null;
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 200) {
        throw new Error('trailOutlierMaxSpeedMps entre 0 e 200 m/s, ou null.');
      }
      out.trailOutlierMaxSpeedMps = n <= 0 ? null : n;
    }
  }
  if (Object.prototype.hasOwnProperty.call(src, 'trailIgnoreAccuracyAboveM')) {
    const v = src.trailIgnoreAccuracyAboveM;
    if (v === null || v === '') {
      out.trailIgnoreAccuracyAboveM = null;
    } else {
      const n = parseInt(String(v), 10);
      if (!Number.isFinite(n) || n < 5 || n > 500) {
        throw new Error('trailIgnoreAccuracyAboveM entre 5 e 500 m, ou vazio.');
      }
      out.trailIgnoreAccuracyAboveM = n;
    }
  }
  if (Object.prototype.hasOwnProperty.call(src, 'warmupBalancedWhileChecklistFocused')) {
    if (typeof src.warmupBalancedWhileChecklistFocused !== 'boolean') {
      throw new Error('warmupBalancedWhileChecklistFocused deve ser boolean.');
    }
    out.warmupBalancedWhileChecklistFocused = src.warmupBalancedWhileChecklistFocused;
  }
  return out;
}

/**
 * Merge de defaults + BD + patch parcial.
 * @param {unknown} stored
 * @param {Record<string, unknown>} [patch]
 */
function mergeGpsCapturePolicy(stored, patch) {
  const cur = normalizeGpsCapturePolicy(stored);
  if (!patch || Object.keys(patch).length === 0) return cur;
  return normalizeGpsCapturePolicy({ ...cur, ...patch });
}

module.exports = {
  GPS_CAPTURE_POLICY_DEFAULTS,
  normalizeGpsCapturePolicy,
  validateGpsCapturePolicyPatch,
  mergeGpsCapturePolicy,
};
