'use strict';

/**
 * Heurísticas leves sobre sugestões de lógica já resolvidas (ids + rótulos).
 * Não substitui validação no motor do app — só alerta o administrador e o LLM na próxima rodada.
 * @param {{
 *   monitorFieldId: string,
 *   monitorLabel: string,
 *   operator: string,
 *   value: string,
 *   targetFieldId: string,
 *   targetLabel: string,
 *   actionType: string,
 * }[]} suggestions
 * @returns {string[]}
 */
function analyzeLogicSuggestionIssues(suggestions) {
  if (!Array.isArray(suggestions) || suggestions.length < 2) return [];

  const warnings = [];
  const seen = new Set();
  let duplicatePairs = 0;
  for (const s of suggestions) {
    if (!s || typeof s !== 'object') continue;
    const key = [
      s.monitorFieldId,
      String(s.operator || ''),
      String(s.value || ''),
      s.targetFieldId,
      String(s.actionType || ''),
      String(s.apiUrl || ''),
      String(s.apiMethod || ''),
    ].join('|');
    if (seen.has(key)) duplicatePairs++;
    else seen.add(key);
  }
  if (duplicatePairs > 0) {
    warnings.push(
      'Há sugestões de lógica duplicadas (mesma origem, condição, alvo e ação). Considere fundir ou remover redundâncias.'
    );
  }

  /** @type {Map<string, { actionType: string, targetLabel: string }[]>} */
  const byTarget = new Map();
  for (const s of suggestions) {
    if (!s || !s.targetFieldId) continue;
    const tid = String(s.targetFieldId);
    if (!byTarget.has(tid)) byTarget.set(tid, []);
    byTarget.get(tid).push({
      actionType: String(s.actionType || '').toUpperCase(),
      targetLabel: String(s.targetLabel || tid),
    });
  }

  for (const [, arr] of byTarget) {
    const types = new Set(arr.map((a) => a.actionType));
    const label = arr[0]?.targetLabel || 'campo';
    if (types.has('SHOW') && types.has('HIDE')) {
      warnings.push(
        `Possível conflito de visibilidade no campo «${label}»: há sugestões SHOW e HIDE — confira se as condições são mutuamente exclusivas.`
      );
    }
    if (types.has('HIDE') && types.has('REQUIRE')) {
      warnings.push(
        `Atenção no campo «${label}»: HIDE e OBRIGATORIEDADE sugeridos — um campo oculto não costuma ser preenchível; ajuste o fluxo se necessário.`
      );
    }
    if (types.has('OPTIONAL') && types.has('REQUIRE')) {
      warnings.push(
        `No campo «${label}»: há sugestões de obrigatório e opcional — mantenha apenas o que fizer sentido para o processo.`
      );
    }
  }

  for (const s of suggestions) {
    if (!s || typeof s !== 'object') continue;
    if (s.monitorFieldId && s.targetFieldId && String(s.monitorFieldId) === String(s.targetFieldId)) {
      warnings.push(
        `Regra com o mesmo campo como origem e destino («${s.monitorLabel || s.monitorFieldId}») — verifique se o motor do app suporta bem este padrão.`
      );
    }
  }

  return warnings;
}

module.exports = {
  analyzeLogicSuggestionIssues,
};
