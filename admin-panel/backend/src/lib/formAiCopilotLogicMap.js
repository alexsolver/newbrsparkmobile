'use strict';

const { normalizeLabelKey } = require('./formAiNormalize');
const { analyzeLogicSuggestionIssues } = require('./formAiLogicConflicts');

/**
 * URLs aceites para sugestões API_FETCH do Composer (bloqueia javascript:, file:, etc.).
 * @param {string} raw
 * @returns {string|null}
 */
function sanitizeCopilotApiFetchUrl(raw) {
  const u = String(raw || '').trim().slice(0, 2048);
  if (!u) return null;
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  const proto = parsed.protocol.toLowerCase();
  if (proto === 'https:') return u;
  if (proto === 'http:') {
    const h = parsed.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1') return u;
  }
  return null;
}

/**
 * @param {object[]} rawList
 * @param {object[]} schemaData
 */
function mapLogicSuggestions(rawList, schemaData) {
  if (!Array.isArray(rawList) || !rawList.length) return { suggestions: [], warnings: [] };
  const fields = (schemaData || []).filter((f) => f && f.type && f.type !== 'section_break');
  const byNorm = new Map();
  const byId = new Map();
  for (const f of fields) {
    byNorm.set(normalizeLabelKey(f.label), f);
    if (f.id != null && String(f.id).trim()) byId.set(String(f.id).trim(), f);
  }
  const suggestions = [];
  const warnings = [];
  let i = 0;
  for (const s of rawList) {
    if (!s || typeof s !== 'object') continue;
    const mid =
      s.monitorFieldId != null && String(s.monitorFieldId).trim()
        ? String(s.monitorFieldId).trim()
        : s.monitorId != null && String(s.monitorId).trim()
          ? String(s.monitorId).trim()
          : '';
    const tid =
      s.targetFieldId != null && String(s.targetFieldId).trim()
        ? String(s.targetFieldId).trim()
        : s.targetId != null && String(s.targetId).trim()
          ? String(s.targetId).trim()
          : '';
    let mon = mid ? byId.get(mid) : null;
    let tgt = tid ? byId.get(tid) : null;
    if (!mon) {
      mon = byNorm.get(normalizeLabelKey(s.monitorLabel || s.condLabel));
    }
    if (!tgt) {
      tgt = byNorm.get(normalizeLabelKey(s.targetLabel));
    }
    if (!mon || !tgt) {
      warnings.push(`Lógica #${i + 1}: monitor ou alvo não encontrado no schema (id ou rótulo inválido).`);
      i++;
      continue;
    }
    const op = String(s.operator || '==').trim();
    const actionType = String(s.actionType || 'SHOW').trim().toUpperCase();

    if (actionType === 'API_FETCH') {
      const safeUrl = sanitizeCopilotApiFetchUrl(s.apiUrl != null ? String(s.apiUrl) : '');
      if (!safeUrl) {
        warnings.push(
          `Lógica #${i + 1} (API_FETCH): URL ausente ou não permitida — use https:// ou http:// apenas para localhost/127.0.0.1.`
        );
        i++;
        continue;
      }
      const method = String(s.apiMethod || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
      const apiResponsePath =
        s.apiResponsePath != null ? String(s.apiResponsePath).trim().slice(0, 500) : '';
      const apiErrorMsg = s.apiErrorMsg != null ? String(s.apiErrorMsg).trim().slice(0, 500) : '';
      const apiAllowOffline = s.apiAllowOffline === true || String(s.apiAllowOffline).toLowerCase() === 'true';
      suggestions.push({
        monitorFieldId: mon.id,
        monitorLabel: mon.label,
        operator: op,
        value: s.value != null ? String(s.value) : '',
        targetFieldId: tgt.id,
        targetLabel: tgt.label,
        actionType: 'API_FETCH',
        apiUrl: safeUrl,
        apiMethod: method,
        apiResponsePath,
        apiErrorMsg,
        apiAllowOffline,
      });
      i++;
      continue;
    }

    const allowed = new Set(['SHOW', 'HIDE', 'REQUIRE', 'OPTIONAL']);
    suggestions.push({
      monitorFieldId: mon.id,
      monitorLabel: mon.label,
      operator: op,
      value: s.value != null ? String(s.value) : '',
      targetFieldId: tgt.id,
      targetLabel: tgt.label,
      actionType: allowed.has(actionType) ? actionType : 'SHOW',
    });
    i++;
  }
  warnings.push(...analyzeLogicSuggestionIssues(suggestions));
  return { suggestions, warnings };
}

module.exports = {
  sanitizeCopilotApiFetchUrl,
  mapLogicSuggestions,
};
