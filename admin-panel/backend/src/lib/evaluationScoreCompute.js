'use strict';

const { classifyTotal } = require('./evaluationConstants');

/**
 * Calcula nota 0–100 e por categoria a partir de respostas (RATING 1–5, NPS 0–10).
 * @param {Array<{ id: string, type: string, categoryKey: string|null, weight: number }>} questions
 * @param {Record<string, unknown>} answersByQuestionId
 */
function computeEvaluationScore(questions, answersByQuestionId) {
  const byCat = {};
  let sumWeighted = 0;
  let weightTotal = 0;

  for (const q of questions) {
    const raw = answersByQuestionId[q.id];
    let normalized100 = null;

    if (q.type === 'RATING') {
      const v =
        raw != null && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw
          ? Number(raw.value)
          : Number(raw);
      if (Number.isFinite(v)) normalized100 = Math.max(0, Math.min(100, Math.round((v / 5) * 100)));
    } else if (q.type === 'NPS') {
      const v =
        raw != null && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw
          ? Number(raw.value)
          : Number(raw);
      if (Number.isFinite(v)) normalized100 = Math.max(0, Math.min(100, Math.round((v / 10) * 100)));
    } else if (q.type === 'BOOLEAN') {
      const b =
        raw === true ||
        raw === false
          ? raw
          : raw != null &&
            typeof raw === 'object' &&
            !Array.isArray(raw) &&
            typeof raw.value === 'boolean'
            ? raw.value
            : null;
      if (b != null) normalized100 = b ? 100 : 40;
    } else {
      continue;
    }

    const w = Number.isFinite(Number(q.weight)) && Number(q.weight) > 0 ? Number(q.weight) : 1;
    sumWeighted += normalized100 * w;
    weightTotal += w;

    const key = q.categoryKey || 'geral';
    if (!byCat[key]) byCat[key] = { sum: 0, w: 0 };
    byCat[key].sum += normalized100 * w;
    byCat[key].w += w;
  }

  const totalScore =
    weightTotal > 0 ? Math.round(sumWeighted / weightTotal) : 0;
  const scoreByCategory = {};
  for (const [key, { sum, w }] of Object.entries(byCat)) {
    scoreByCategory[key] = w > 0 ? Math.round(sum / w) : 0;
  }

  return {
    totalScore,
    scoreByCategory,
    classification: classifyTotal(totalScore),
  };
}

module.exports = { computeEvaluationScore };
