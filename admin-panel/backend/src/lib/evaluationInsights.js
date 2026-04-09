'use strict';

/**
 * Insights automáticos (fase 2+ pode ligar a LLM). MVP: regras simples.
 */
function buildInsights({ classification, totalScore, scoreByCategory }) {
  const tips = [];
  if (classification === 'CRITICAL') {
    tips.push('Pontuação abaixo do esperado: registe um plano de ação e confirme ciência se aplicável.');
  }
  if (scoreByCategory && typeof scoreByCategory === 'object') {
    for (const [k, v] of Object.entries(scoreByCategory)) {
      if (Number(v) < 60) {
        tips.push(`Categoria "${k}" com nota baixa (${v}) — foco de melhoria.`);
      }
    }
  }
  if (classification === 'EXCELLENT') {
    tips.push('Desempenho muito positivo nesta avaliação.');
  }
  return {
    version: 1,
    summary: tips.length ? tips.join(' ') : 'Sem sugestões automáticas adicionais.',
    tips,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildInsights };
