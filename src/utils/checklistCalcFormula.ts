import { Parser } from 'expr-eval';

const parser = new Parser();

/**
 * Substitui referências a chaves de resposta na fórmula.
 * Ordena chaves por comprimento decrescente para evitar que um ID prefixo de outro corrompa a expressão.
 */
export function substituteChecklistFormulaKeys(formula: string, responses: Record<string, unknown>): string {
  let raw = formula || '';
  const keys = Object.keys(responses).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const valObj = responses[key];
    const rawVal = Array.isArray(valObj) ? valObj[0] : valObj;
    const num = parseFloat(String(rawVal));
    const val = Number.isFinite(num) ? num : 0;
    raw = raw.split(key).join(String(val));
  }
  return raw;
}

/**
 * Avalia expressão numérica (sem `eval`). Usa apenas o motor matemático do expr-eval.
 * Em caso de sintaxe inválida ou resultado não finito, devolve NaN.
 */
export function evaluateChecklistMathExpression(expression: string): number {
  const trimmed = (expression || '').trim();
  if (!trimmed) return 0;
  try {
    const parsed = parser.parse(trimmed);
    const n = parsed.evaluate({});
    if (typeof n === 'number' && Number.isFinite(n)) return n;
    if (typeof n === 'boolean') return n ? 1 : 0;
    const coerced = Number(n);
    return Number.isFinite(coerced) ? coerced : NaN;
  } catch {
    return NaN;
  }
}

export function computeChecklistCalculatedValue(formula: string, responses: Record<string, unknown>): number {
  const substituted = substituteChecklistFormulaKeys(formula, responses);
  const n = evaluateChecklistMathExpression(substituted);
  return Number.isFinite(n) ? n : 0;
}
