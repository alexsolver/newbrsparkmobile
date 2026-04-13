/**
 * Motor de condições SE (regras de negócio / form builder).
 * Mantém paridade com `admin-panel/js/checklists-builder.js` (operadores e IDs especiais).
 */

export const FORM_CLOCK_COND_ID = '__brspark_form_clock__';

export type RuleSchemaField = { id?: string; type?: string };

export type RuleTimingHelpers = {
  getFormElapsedSeconds: (responses: Record<string, unknown>, nowMs: number) => number;
  getSectionElapsedSeconds: (
    responses: Record<string, unknown>,
    sectionId: string,
    nowMs: number,
  ) => number | null;
  getSectionTimingKeys: (sectionId: string) => { start: string; end: string };
};

const REGEX_MAX_LEN = 500;

function responseDisplayString(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) return raw.map((v) => String(v)).join(', ');
  return String(raw);
}

function parseToNorm(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return val.map((v) => String(v).toLowerCase()).join(', ').trim();
  return String(val).toLowerCase().trim();
}

function parseNumLocalized(raw: unknown): number | null {
  const s = responseDisplayString(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function targetNum(condValue: unknown): number {
  return parseFloat(String(condValue ?? '0').replace(',', '.')) || 0;
}

/** Intervalo numérico ou de segundos: "min|max" ou "min~max". */
function parseBetween(condValue: unknown): [number, number] | null {
  const s = String(condValue ?? '').trim();
  const parts = s.split(/[|~]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const a = parseFloat(parts[0].replace(',', '.'));
  const b = parseFloat(parts[1].replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

function splitList(condValue: unknown): string[] {
  return String(condValue ?? '')
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function splitListLower(condValue: unknown): string[] {
  return splitList(condValue).map((t) => t.toLowerCase());
}

function parseBoolish(raw: unknown): boolean | null {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'y', 'on', 'checked'].includes(s)) return true;
  if (['0', 'false', 'não', 'nao', 'no', 'n', 'off', 'unchecked'].includes(s)) return false;
  return null;
}

function selectionCount(raw: unknown): number {
  if (Array.isArray(raw)) {
    return raw.filter((x) => {
      if (x === '' || x == null) return false;
      if (typeof x === 'object' && x !== null && !Array.isArray(x)) {
        return Object.keys(x as object).length > 0;
      }
      return true;
    }).length;
  }
  if (raw === undefined || raw === null || raw === '') return 0;
  return 1;
}

function parseInstantMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const t = Date.parse(String(v).trim());
  return Number.isNaN(t) ? null : t;
}

function compareCount(raw: unknown, op: string, target: number): boolean {
  const c = selectionCount(raw);
  switch (op) {
    case 'count_eq':
      return c === target;
    case 'count_neq':
      return c !== target;
    case 'count_gt':
      return c > target;
    case 'count_gte':
      return c >= target;
    case 'count_lt':
      return c < target;
    case 'count_lte':
      return c <= target;
    default:
      return false;
  }
}

function compareLength(display: string, op: string, target: number): boolean {
  const len = display.length;
  switch (op) {
    case 'length_eq':
      return len === target;
    case 'length_neq':
      return len !== target;
    case 'length_gt':
      return len > target;
    case 'length_gte':
      return len >= target;
    case 'length_lt':
      return len < target;
    case 'length_lte':
      return len <= target;
    default:
      return false;
  }
}

function evalElapsedOp(elapsed: number, op: string, condValue: unknown): boolean {
  const t = targetNum(condValue);
  const flooredElapsed = Math.floor(elapsed);
  const flooredT = Math.floor(t);
  switch (op) {
    case 'form_elapsed_sec_gte':
    case 'section_elapsed_sec_gte':
      return elapsed >= t;
    case 'form_elapsed_sec_lte':
    case 'section_elapsed_sec_lte':
      return elapsed <= t;
    case 'form_elapsed_sec_gt':
    case 'section_elapsed_sec_gt':
      return elapsed > t;
    case 'form_elapsed_sec_lt':
    case 'section_elapsed_sec_lt':
      return elapsed < t;
    case 'form_elapsed_sec_eq':
    case 'section_elapsed_sec_eq':
      return flooredElapsed === flooredT;
    case 'form_elapsed_sec_between':
    case 'section_elapsed_sec_between': {
      const r = parseBetween(condValue);
      return r ? elapsed >= r[0] && elapsed <= r[1] : false;
    }
    default:
      return false;
  }
}

/**
 * Avalia uma condição SE (campo monitorizado + operador + valor).
 */
export function evaluateBusinessCondition(
  condFieldId: string,
  op: string,
  condValue: unknown,
  dataModel: Record<string, unknown>,
  nowMs: number,
  schema: RuleSchemaField[],
  timing: RuleTimingHelpers,
): boolean {
  if (condFieldId === FORM_CLOCK_COND_ID) {
    const elapsed = timing.getFormElapsedSeconds(dataModel, nowMs);
    return evalElapsedOp(elapsed, op, condValue);
  }

  const condFieldDef = schema.find((x) => x && x.id === condFieldId);
  if (condFieldDef?.type === 'section_break') {
    const { start, end } = timing.getSectionTimingKeys(condFieldId);
    const hasStart = !!dataModel[start];
    const hasEnd = !!dataModel[end];
    const elapsed = timing.getSectionElapsedSeconds(dataModel, condFieldId, nowMs);

    if (op === 'section_has_started') return hasStart;
    if (op === 'section_not_started') return !hasStart;
    if (op === 'section_has_ended') return hasEnd;
    if (op === 'section_not_ended') return hasStart && !hasEnd;
    if (op === 'section_in_progress') return hasStart && !hasEnd;

    if (
      op === 'section_elapsed_sec_gte' ||
      op === 'section_elapsed_sec_lte' ||
      op === 'section_elapsed_sec_gt' ||
      op === 'section_elapsed_sec_lt' ||
      op === 'section_elapsed_sec_eq' ||
      op === 'section_elapsed_sec_between'
    ) {
      if (elapsed == null) return false;
      return evalElapsedOp(elapsed, op, condValue);
    }
    return false;
  }

  const rawDepVal = dataModel[condFieldId];
  const depNorm = parseToNorm(rawDepVal);
  const depDisplay = responseDisplayString(rawDepVal).trim();
  const targetNorm = parseToNorm(condValue);
  const targetDisplay = String(condValue ?? '').trim();

  const condFieldType = String(condFieldDef?.type ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
  if (condFieldType === 'vision_checklist' || condFieldType === 'vision_ai_analysis') {
    const visionFilled = (() => {
      if (rawDepVal === undefined || rawDepVal === null) return false;
      let o: unknown = rawDepVal;
      if (typeof rawDepVal === 'string') {
        try {
          o = JSON.parse(rawDepVal);
        } catch {
          return false;
        }
      }
      if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
      const st = String((o as { status?: string }).status || '').toLowerCase();
      const ans = (o as { answers?: unknown }).answers;
      return st === 'completed' && Array.isArray(ans) && ans.length > 0;
    })();
    if (op === 'is_empty') return !visionFilled;
    if (op === 'not_empty') return visionFilled;
  }

  if (op === 'is_empty') return depNorm === '';
  if (op === 'not_empty') return depNorm !== '';

  if (op === 'is_true') return parseBoolish(rawDepVal) === true;
  if (op === 'is_false') return parseBoolish(rawDepVal) === false;

  if (op === '==') return depNorm === targetNorm;
  if (op === '!=') return depNorm !== targetNorm;
  if (op === 'contains') return targetNorm !== '' && depNorm.includes(targetNorm);
  if (op === 'not_contains') return targetNorm === '' ? true : !depNorm.includes(targetNorm);
  if (op === 'starts_with') return targetNorm !== '' && depNorm.startsWith(targetNorm);
  if (op === 'ends_with') return targetNorm !== '' && depNorm.endsWith(targetNorm);
  if (op === 'not_starts_with') return targetNorm === '' ? true : !depNorm.startsWith(targetNorm);
  if (op === 'not_ends_with') return targetNorm === '' ? true : !depNorm.endsWith(targetNorm);

  if (op === 'one_of') {
    const opts = splitListLower(condValue);
    if (!opts.length) return false;
    return opts.includes(depNorm);
  }
  if (op === 'none_of') {
    const opts = splitListLower(condValue);
    if (!opts.length) return false;
    return !opts.includes(depNorm);
  }

  if (op === 'includes_any') {
    const parts = splitListLower(condValue);
    if (!parts.length) return false;
    return parts.some((p) => depNorm.includes(p));
  }
  if (op === 'includes_all') {
    const parts = splitListLower(condValue);
    if (!parts.length) return false;
    return parts.every((p) => depNorm.includes(p));
  }
  if (op === 'excludes_all') {
    const parts = splitListLower(condValue);
    if (!parts.length) return true;
    return parts.every((p) => !depNorm.includes(p));
  }

  if (op === 'matches_regex') {
    const pat = String(condValue ?? '').trim();
    if (!pat || pat.length > REGEX_MAX_LEN) return false;
    try {
      const re = new RegExp(pat, 'i');
      return re.test(depDisplay);
    } catch {
      return false;
    }
  }

  if (
    op === 'length_eq' ||
    op === 'length_neq' ||
    op === 'length_gt' ||
    op === 'length_gte' ||
    op === 'length_lt' ||
    op === 'length_lte'
  ) {
    const targetLen = Math.floor(targetNum(condValue));
    if (!Number.isFinite(targetLen) || targetLen < 0) return false;
    return compareLength(depDisplay, op, targetLen);
  }

  if (
    op === 'count_eq' ||
    op === 'count_neq' ||
    op === 'count_gt' ||
    op === 'count_gte' ||
    op === 'count_lt' ||
    op === 'count_lte'
  ) {
    const targetC = Math.floor(targetNum(condValue));
    if (!Number.isFinite(targetC) || targetC < 0) return false;
    return compareCount(rawDepVal, op, targetC);
  }

  if (
    op === 'date_before' ||
    op === 'date_after' ||
    op === 'date_on_or_before' ||
    op === 'date_on_or_after'
  ) {
    const depMs = parseInstantMs(rawDepVal);
    const refMs = parseInstantMs(condValue);
    if (depMs == null || refMs == null) return false;
    if (op === 'date_before') return depMs < refMs;
    if (op === 'date_after') return depMs > refMs;
    if (op === 'date_on_or_before') return depMs <= refMs;
    return depMs >= refMs;
  }

  const numDep = parseNumLocalized(rawDepVal);
  const numTarget = parseNumLocalized(condValue);

  if (op === 'between' || op === 'not_between') {
    const range = parseBetween(condValue);
    if (!range || numDep == null) return false;
    const inside = numDep >= range[0] && numDep <= range[1];
    return op === 'between' ? inside : !inside;
  }

  if (numDep == null || numTarget == null) return false;

  if (op === '>') return numDep > numTarget;
  if (op === '<') return numDep < numTarget;
  if (op === '>=') return numDep >= numTarget;
  if (op === '<=') return numDep <= numTarget;

  return false;
}

/** Operadores válidos para campo “normal” (não seção nem cronómetro geral) — UI + normalização. */
export const NORMAL_FIELD_CONDITION_OPERATORS: string[] = [
  '==',
  '!=',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'not_starts_with',
  'not_ends_with',
  'is_empty',
  'not_empty',
  'is_true',
  'is_false',
  '>',
  '<',
  '>=',
  '<=',
  'between',
  'not_between',
  'one_of',
  'none_of',
  'includes_any',
  'includes_all',
  'excludes_all',
  'matches_regex',
  'length_eq',
  'length_neq',
  'length_gt',
  'length_gte',
  'length_lt',
  'length_lte',
  'count_eq',
  'count_neq',
  'count_gt',
  'count_gte',
  'count_lt',
  'count_lte',
  'date_before',
  'date_after',
  'date_on_or_before',
  'date_on_or_after',
];

export const FORM_CLOCK_CONDITION_OPERATORS: string[] = [
  'form_elapsed_sec_gte',
  'form_elapsed_sec_lte',
  'form_elapsed_sec_gt',
  'form_elapsed_sec_lt',
  'form_elapsed_sec_eq',
  'form_elapsed_sec_between',
];

export const SECTION_CONDITION_OPERATORS: string[] = [
  'section_has_started',
  'section_not_started',
  'section_has_ended',
  'section_not_ended',
  'section_in_progress',
  'section_elapsed_sec_gte',
  'section_elapsed_sec_lte',
  'section_elapsed_sec_gt',
  'section_elapsed_sec_lt',
  'section_elapsed_sec_eq',
  'section_elapsed_sec_between',
];

export function logicConditionNeedsNumericInput(operator: string): boolean {
  return (
    operator === 'section_elapsed_sec_gte' ||
    operator === 'section_elapsed_sec_lte' ||
    operator === 'section_elapsed_sec_gt' ||
    operator === 'section_elapsed_sec_lt' ||
    operator === 'section_elapsed_sec_eq' ||
    operator === 'section_elapsed_sec_between' ||
    operator === 'form_elapsed_sec_gte' ||
    operator === 'form_elapsed_sec_lte' ||
    operator === 'form_elapsed_sec_gt' ||
    operator === 'form_elapsed_sec_lt' ||
    operator === 'form_elapsed_sec_eq' ||
    operator === 'form_elapsed_sec_between'
  );
}

export function logicConditionNeedsNoValueField(operator: string): boolean {
  return (
    operator === 'is_empty' ||
    operator === 'not_empty' ||
    operator === 'is_true' ||
    operator === 'is_false' ||
    operator === 'section_has_started' ||
    operator === 'section_not_started' ||
    operator === 'section_has_ended' ||
    operator === 'section_not_ended' ||
    operator === 'section_in_progress'
  );
}
