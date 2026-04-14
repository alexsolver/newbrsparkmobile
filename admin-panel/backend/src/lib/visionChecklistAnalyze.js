'use strict';

/** Nome canônico na UI e em novas gravações. */
const VISION_INTEGRATION_NAME = 'Visão IA - YOLO';
/** Integrações antigas na BD (mesmo findFirst que o nome canônico). */
const VISION_INTEGRATION_LEGACY_NAME = 'Visão IA (checklists)';

/** Uma única pergunta/prompt: não duplicar o texto longo do prompt em `answers[].question` (UI e relatórios). */
const VISION_SINGLE_ANSWER_QUESTION_LABEL = 'Resultado da análise';

/** Cláusula Prisma: tipo VISION e nome novo ou legado. */
function prismaWhereVisionChecklistIntegration() {
  return {
    type: 'VISION',
    OR: [{ name: VISION_INTEGRATION_NAME }, { name: VISION_INTEGRATION_LEGACY_NAME }],
  };
}

/**
 * @param {unknown} v
 * @returns {'yes' | 'no' | 'unknown'}
 */
function normalizeYesNo(v) {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (s === 'yes' || s === 'sim' || s === 'true' || s === '1' || s === 'y') return 'yes';
  if (s === 'no' || s === 'não' || s === 'nao' || s === 'false' || s === '0' || s === 'n') return 'no';
  if (s === 'unknown' || s === 'indefinido' || s === 'indeterminado') return 'unknown';
  return 'unknown';
}

/** Respostas não binárias no modo prompt único (nota, rótulo curto, etc.). */
const MAX_VISION_FREE_TEXT_VALUE_LEN = 220;

/**
 * Normaliza `value` de cada resposta: com uma única pergunta/prompt, aceita texto livre curto
 * (ex.: nota numérica) sem forçar yes/no; com várias perguntas mantém só sim/não (compat. YOLO).
 * @param {unknown} val
 * @param {boolean} singleQuestion
 * @returns {string}
 */
/**
 * Extrai nota 0–10 da raiz do JSON do modelo (Gemini).
 * @param {unknown} raw
 * @returns {number | null}
 */
function parseRating0To10(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const r = Math.round(raw);
    return r >= 0 && r <= 10 ? r : null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  return n >= 0 && n <= 10 ? n : null;
}

/**
 * @param {Record<string, unknown>} root
 * @returns {number | null}
 */
function pickRating0To10FromRoot(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const r =
    root.rating0To10 ??
    root.rating_0_to_10 ??
    root.rating0_10 ??
    root.classification0To10 ??
    root.classification_0_to_10;
  return parseRating0To10(r);
}

function normalizeVisionAnswerValue(val, singleQuestion) {
  if (!singleQuestion) {
    return normalizeYesNo(val);
  }
  if (val !== undefined && val !== null) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      return String(val).slice(0, MAX_VISION_FREE_TEXT_VALUE_LEN);
    }
    const str = String(val).trim();
    if (/^\d+(\.\d+)?$/.test(str)) {
      return str.slice(0, MAX_VISION_FREE_TEXT_VALUE_LEN);
    }
  }
  const yn = normalizeYesNo(val);
  if (yn !== 'unknown') return yn;
  const s = String(val ?? '').trim();
  if (!s) return 'unknown';
  return s.slice(0, MAX_VISION_FREE_TEXT_VALUE_LEN);
}

/**
 * Confiança 0–1 (aceita também 0–100).
 * @param {unknown} c
 * @returns {number}
 */
function normalizeConfidence(c) {
  const n = typeof c === 'number' ? c : parseFloat(String(c ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1 && n <= 100) return Math.min(1, n / 100);
  return Math.min(1, n);
}

function normQuestionText(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Respostas em chaves iguais aos ids das perguntas na raiz do JSON (ex.: { "q_1": { "value": "sim" }, "q_2": {} }).
 * @param {Record<string, unknown>} root
 * @param {{ id: string, text: string }[]} questions
 */
function answersFromQuestionIdKeysAtRoot(root, questions) {
  if (!root || typeof root !== 'object' || Array.isArray(root) || !Array.isArray(questions)) return [];
  const out = [];
  for (const q of questions) {
    const k = String(q.id);
    if (!Object.prototype.hasOwnProperty.call(root, k)) continue;
    const v = root[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push({ questionId: k, .../** @type {any} */ (v) });
    } else if (v !== undefined && v !== null) {
      out.push({ questionId: k, value: v });
    }
  }
  return out;
}

/**
 * JSON embutido em string (LLM / gateways).
 * @param {Record<string, unknown>} root
 * @returns {Record<string, unknown> | null}
 */
function maybeParseEmbeddedJsonObject(root) {
  if (!root || typeof root !== 'object') return null;
  for (const key of ['output', 'text', 'message', 'content', 'body', 'response']) {
    const s = root[key];
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) continue;
    try {
      const inner = JSON.parse(t);
      if (inner && typeof inner === 'object') return /** @type {Record<string, unknown>} */ (inner);
    } catch {
      /* ignora */
    }
  }
  return null;
}

/**
 * Um único objeto com value/confidence na raiz (uma pergunta no checklist).
 * @param {Record<string, unknown>} root
 * @param {{ id: string, text: string }} q0
 */
function singleQuestionRootFallback(root, q0) {
  if (!root || typeof root !== 'object' || Array.isArray(root) || !q0) return [];
  const metaKeys = new Set([
    'answers',
    'data',
    'result',
    'results',
    'responses',
    'errors',
    'requestId',
    'schemaVersion',
    'status',
    'media',
    'modelVersion',
    'success',
    'ok',
    'message',
    'output',
    'partial',
    'processedAt',
    'questions',
    'detections',
    'count',
  ]);
  const val =
    root.value ??
    root.answer ??
    root.prediction ??
    root.label ??
    root.decision ??
    root.classification ??
    root.outcome;
  const conf = root.confidence ?? root.score ?? root.probability ?? root.certainty;
  if (val === undefined && conf === undefined) return [];
  if (root.error != null && val === undefined) return [];
  const noise = Object.keys(root).filter((k) => !metaKeys.has(k) && !String(k).startsWith('_'));
  if (noise.length > 8) return [];
  return [{ questionId: q0.id, question: q0.text, value: val, confidence: conf }];
}

/** Uma linha do JSON parece resposta (não só definição id+texto; ignora caixas YOLO cruas). */
function looksLikeAnswerRow(x, depth = 0) {
  if (depth > 4 || !x || typeof x !== 'object') return false;
  const o = /** @type {any} */ (x);
  if (o.bbox != null || o.box != null) return false;
  /** Eco do pedido na raiz `questions`: só id/texto (sem valor nem count) não é linha de resposta. */
  const echoKeys = new Set([
    'id',
    'text',
    'question',
    'questiontext',
    'question_id',
    'questionid',
  ]);
  const keys = Object.keys(o).filter((k) => !String(k).startsWith('_'));
  const nk = keys.map((k) => String(k).toLowerCase());
  const onlyEcho =
    keys.length > 0 &&
    keys.length <= 6 &&
    nk.every((k) => echoKeys.has(k)) &&
    o.value == null &&
    o.answer == null &&
    o.response == null &&
    o.resposta == null &&
    o.count == null;
  if (onlyEcho) return false;
  if (o.x != null && o.y != null && o.width != null && o.height != null && o.value == null && o.answer == null) {
    return false;
  }
  if (
    typeof o.count === 'number' &&
    Number.isFinite(o.count) &&
    (String(o.id ?? o.questionId ?? '').length > 0 || String(o.text ?? o.question ?? '').trim().length > 0)
  ) {
    return true;
  }
  if (
    o.value != null ||
    o.answer != null ||
    o.response != null ||
    o.resposta != null ||
    typeof o.yes === 'boolean' ||
    typeof o.detected === 'boolean' ||
    typeof o.found === 'boolean' ||
    o.confidence != null ||
    o.score != null ||
    o.prediction != null
  ) {
    return true;
  }
  if (typeof o.label === 'string' && o.label.trim() !== '') return true;
  if (o.result && typeof o.result === 'object') return looksLikeAnswerRow(o.result, depth + 1);
  if (o.analysis && typeof o.analysis === 'object') return looksLikeAnswerRow(o.analysis, depth + 1);
  return false;
}

/**
 * Envelope YOLO compacto na raiz: `detections` + `count`, com `questions` que espelha
 * os ids/textos enviados (não são linhas com value/answer — `looksLikeAnswerRow` falha).
 * @param {Record<string, unknown>} root
 * @param {{ id: string, text: string }[]} questions
 * @returns {unknown[]}
 */
/**
 * Perguntas típicas em PT (inspeção) → classes comuns em modelos COCO / YOLO em inglês.
 * Não substitui `answers` explícitos do serviço; só melhora o mapeamento quando só há `detections`.
 */
const QUESTION_CLASS_HINTS = [
  {
    re: /tecido|amassad|rugos|lençol|lencol|toalha|cama|travesseiro|roupa de cama|colch(a|ã)o|edredom/,
    labels: [
      'bed',
      'pillow',
      'blanket',
      'couch',
      'sofa',
      'sheet',
      'linen',
      'textile',
      'towel',
      'duvet',
      'mattress',
      'cama',
      'travesseiro',
      'almofada',
      'cobertor',
      'toalha',
    ],
  },
  {
    re: /objeto.*ch[aã]o|ch[aã]o.*objeto|piso.*objeto|objeto.*piso|no piso|no ch[aã]o|no chao/,
    labels: [
      'bottle',
      'cup',
      'wine glass',
      'bowl',
      'remote',
      'cell phone',
      'book',
      'clock',
      'vase',
      'scissors',
      'backpack',
      'umbrella',
      'handbag',
      'suitcase',
      'skateboard',
      'baseball bat',
      'tennis racket',
      'hair drier',
      'toothbrush',
      'keyboard',
      'mouse',
      'laptop',
      'frisbee',
      'tie',
      'shoe',
      'sandals',
      'garrafa',
      'copo',
      'livro',
      'mochila',
      'chinelo',
      'sapato',
    ],
  },
  {
    re: /mancha|manchas|sujo|derrame|n(o|ó)doa|engordurado/,
    labels: ['stain', 'spot', 'dirt', 'damage', 'rust', 'mold', 'mancha', 'nodo'],
  },
  /** COCO / YOLO em inglês — perguntas comuns em PT no app. */
  {
    re: /celular|celulares|smartphone|telefone(\s+m[oó]vel)?|\biphone\b|\bandroid\b/i,
    labels: [
      'cell phone',
      'mobile phone',
      'phone',
      'smartphone',
      'telephone',
      'telefone',
      'celular',
    ],
  },
  {
    re: /copo|copos|x[ií]cara|xicaras|ch[ií]cara|chicara|caneca|canecas|ta(ç|c)a|ta(ç|c)as/i,
    labels: [
      'cup',
      'wine glass',
      'wineglass',
      'mug',
      'glass',
      'tumbler',
      'bowl',
      'bottle',
      'copo',
      'xícara',
      'caneca',
    ],
  },
];

function classHintMatchesQuestion(qtNorm, labelNorm) {
  if (!qtNorm || !labelNorm || labelNorm.length < 2) return false;
  for (const h of QUESTION_CLASS_HINTS) {
    if (!h.re.test(qtNorm)) continue;
    for (const labEn of h.labels) {
      const ln = normQuestionText(String(labEn).replace(/_/g, ' '));
      if (ln.length < 2) continue;
      if (labelNorm.includes(ln) || ln.includes(labelNorm)) return true;
      const parts = labelNorm.split(/\s+/).filter((x) => x.length >= 3);
      if (parts.some((p) => ln.includes(p) || p.includes(ln))) return true;
    }
  }
  return false;
}

function answersFromDetectionsEnvelope(root, questions) {
  if (!root || typeof root !== 'object' || Array.isArray(root) || !Array.isArray(questions) || !questions.length) {
    return [];
  }
  const detections = Array.isArray(root.detections) ? root.detections : [];

  const labelOf = (o) => {
    if (!o || typeof o !== 'object') return '';
    const d = /** @type {any} */ (o);
    const nested =
      d.attributes && typeof d.attributes === 'object'
        ? /** @type {any} */ (d.attributes).label ?? /** @type {any} */ (d.attributes).class
        : undefined;
    return normQuestionText(
      String(
        d.label ??
          d.class ??
          d.name ??
          d.category ??
          d.class_name ??
          d.className ??
          d.detection_class ??
          d.detectionClass ??
          (typeof d.text === 'string' ? d.text : '') ??
          nested ??
          '',
      ).replace(/_/g, ' '),
    );
  };

  const cnt =
    typeof root.count === 'number' && Number.isFinite(root.count)
      ? Math.max(0, Math.floor(root.count))
      : detections.length;
  const any = cnt > 0 || detections.length > 0;

  const maxDetectionConfidence = () => {
    const scores = [];
    for (const d of detections) {
      if (!d || typeof d !== 'object') continue;
      const o = /** @type {any} */ (d);
      const c = normalizeConfidence(o.confidence ?? o.score ?? o.probability ?? o.confidence_score);
      if (c > 0) scores.push(c);
    }
    return scores.length ? Math.min(1, Math.max(...scores)) : 0;
  };

  const confYes = any ? Math.max(0.52, maxDetectionConfidence() || 0.65) : 0;
  const confNo = 0.38;

  if (questions.length === 1) {
    const q = questions[0];
    const qt = normQuestionText(q.text);
    /** Perguntas de critério subjetivo: «sim» só com deteção genérica costuma ser falso. */
    const qualitativo = /limpo|limpeza|sujo|organiz|arrumad|ordenad|ordem|bagun/i.test(qt);
    if (qualitativo && any) {
      const labs = detections.map((d) => labelOf(/** @type {any} */ (d))).filter((s) => s.length >= 2);
      const overlap = labs.some((lab) => {
        const t = lab;
        if (t.length < 3) return false;
        if (qt.includes(t) || t.includes(qt.slice(0, Math.min(24, qt.length)))) return true;
        return qt.split(/\s+/).some((w) => w.length >= 4 && (t.includes(w) || w.includes(t)));
      });
      if (!overlap && detections.length) {
        return [
          {
            questionId: q.id,
            question: q.text,
            value: 'unknown',
            confidence: 0,
            rationale:
              'Foram detectados objetos, mas nenhuma classe corresponde ao texto desta pergunta (limpeza/ordem). Prefira um modelo que devolva `answers` ou confira manualmente.',
          },
        ];
      }
    }
    return [
      {
        questionId: q.id,
        question: q.text,
        value: any ? 'yes' : 'no',
        confidence: any ? confYes : confNo,
        rationale: any ? (cnt ? `${cnt} deteção(ões)` : `${detections.length} deteção(ões)`) : '',
      },
    ];
  }

  const asksQuantity = (qtNorm) =>
    /\bquant(os|as)\b|\bquantidade\b|\bquant\b|\bcuantos\b|\bcuantas\b/i.test(String(qtNorm || ''));

  const out = [];
  let anyMatched = false;
  for (const q of questions) {
    const qt = normQuestionText(q.text);
    const qtyQ = asksQuantity(qt);
    /** @type {{ o: any, sc: number, hitHint: boolean }[]} */
    const hits = [];
    for (const d of detections) {
      if (!d || typeof d !== 'object') continue;
      const o = /** @type {any} */ (d);
      const lab = labelOf(o);
      if (lab.length < 2) continue;
      const tokens = qt.split(/\s+/).filter((w) => w.length > 2);
      const hitText =
        qt.includes(lab) ||
        (lab.length >= 3 && qt.includes(lab.slice(0, Math.min(lab.length, 24)))) ||
        tokens.some((w) => w.length >= 3 && (lab.includes(w) || w.includes(lab)));
      const hitHint = classHintMatchesQuestion(qt, lab);
      if (hitText || hitHint) {
        const sc = normalizeConfidence(o.confidence ?? o.score ?? 0.72);
        hits.push({ o, sc, hitHint: Boolean(hitHint && !hitText) });
      }
    }
    if (hits.length) {
      anyMatched = true;
      const best = hits.reduce((a, b) => (b.sc >= a.sc ? b : a));
      const n = hits.length;
      const rationaleParts = [
        String(best.o.label ?? best.o.class ?? '').slice(0, 100),
        best.hitHint ? '(mapeamento heurístico PT↔classes do modelo)' : '',
      ];
      if (qtyQ && n > 0) {
        rationaleParts.push(`${n} deteção(ões) compatível(is).`);
      }
      /** @type {Record<string, unknown>} */
      const row = {
        questionId: q.id,
        question: q.text,
        value: 'yes',
        confidence: Math.max(0.5, best.sc || 0.72),
        rationale: rationaleParts.filter(Boolean).join(' ').slice(0, 200),
      };
      if (qtyQ) row.count = n;
      out.push(row);
    } else {
      const fallback =
        qtyQ && any
          ? {
              value: 'no',
              confidence: confNo,
              rationale: 'Nenhuma deteção com classe compatível com esta pergunta (contagem = 0).',
            }
          : { value: 'unknown', confidence: 0, rationale: '' };
      out.push({
        questionId: q.id,
        question: q.text,
        value: fallback.value,
        confidence: fallback.confidence,
        rationale: fallback.rationale,
      });
    }
  }

  if (anyMatched) return out;

  if (!any) {
    return questions.map((q) => ({
      questionId: q.id,
      question: q.text,
      value: 'no',
      confidence: confNo,
      rationale: '',
    }));
  }

  /**
   * Sem match texto↔classe: não inferir «sim» para todas (gera «limpo/organizado» errados
   * quando só há caixas genéricas). Preferir indefinido até o serviço devolver `answers`.
   */
  return questions.map((q) => ({
    questionId: q.id,
    question: q.text,
    value: 'unknown',
    confidence: 0,
    rationale:
      'Há detecções, mas o serviço não associou classes ao texto de cada pergunta. Ajuste o YOLO para devolver `answers` (com questionId/value) ou preencha manualmente.',
  }));
}

/**
 * Alguns serviços devolvem `questions` com o mesmo comprimento do pedido e um valor por índice
 * (`answer`, `value`, `yes`, `count`, `result`, ou campos lidos por `pickAnswerValue`).
 * @param {Record<string, unknown>} root
 * @param {{ id: string, text: string }[]} sentQuestions
 * @returns {unknown[]}
 */
function answersFromParallelResponseQuestions(root, sentQuestions) {
  const rq = root.questions;
  if (!Array.isArray(rq) || !Array.isArray(sentQuestions) || rq.length !== sentQuestions.length) return [];
  const out = [];
  for (let i = 0; i < sentQuestions.length; i++) {
    const q = sentQuestions[i];
    const item = rq[i];
    if (!item || typeof item !== 'object') return [];
    const o = /** @type {any} */ (item);
    const idSent = String(q.id).trim();
    const idIt = String(o.id ?? o.questionId ?? '').trim();
    if (idIt && idIt !== idSent) return [];
    const val = pickAnswerValue(/** @type {Record<string, unknown>} */ (o));
    if (val !== undefined) {
      out.push({ ...o, questionId: q.id, question: String(o.question ?? o.questionText ?? q.text).slice(0, 500) });
      continue;
    }
    if (typeof o.count === 'number' && Number.isFinite(o.count)) {
      out.push({
        questionId: q.id,
        question: q.text,
        count: o.count,
        confidence: o.confidence ?? o.score,
      });
      continue;
    }
    if (typeof o.yes === 'boolean') {
      out.push({
        questionId: q.id,
        question: q.text,
        yes: o.yes,
        confidence: o.confidence ?? o.score,
      });
      continue;
    }
    if (o.answer != null || o.value != null) {
      out.push({
        questionId: q.id,
        question: q.text,
        value: o.answer ?? o.value,
        confidence: o.confidence ?? o.score,
      });
      continue;
    }
    return [];
  }
  return out;
}

/**
 * Extrai lista de «respostas por pergunta» de formatos comuns (YOLO / LLM / legados).
 * @param {unknown} data
 * @param {{ id: string, text: string }[]} questions
 * @param {number} [depth]
 * @returns {unknown[]}
 */
function coerceRawAnswersList(data, questions, depth = 0) {
  if (depth > 5) return [];
  if (Array.isArray(data)) {
    return data.filter((x) => x != null);
  }
  if (!data || typeof data !== 'object') return [];

  const root = /** @type {Record<string, unknown>} */ (data);
  const pick = (v) => (Array.isArray(v) ? v : []);
  let arr = pick(root.answers);

  /** `questions[]` alinhado ao pedido, com valor por ítem (antes do envelope genérico). */
  if (!arr.length && Array.isArray(root.questions) && Array.isArray(questions) && questions.length) {
    const parallel = answersFromParallelResponseQuestions(root, questions);
    if (parallel.length === questions.length) arr = parallel;
  }

  /**
   * Envelope { count, detections, questions: eco } — só se ainda não há respostas.
   */
  if (
    !arr.length &&
    Array.isArray(questions) &&
    questions.length &&
    (Array.isArray(root.detections) || typeof root.count === 'number')
  ) {
    const synth = answersFromDetectionsEnvelope(root, questions);
    if (synth.length === questions.length) arr = synth;
  }

  /** APIs YOLO: array "questions" só quando os itens são mesmo respostas (não só id+texto). */
  if (!arr.length && Array.isArray(root.questions) && root.questions.some((q) => looksLikeAnswerRow(q))) {
    arr = root.questions.filter((q) => looksLikeAnswerRow(q));
  }

  /** "detections" como lista de respostas por pergunta (não caixas só com x,y,w,h). */
  if (!arr.length && Array.isArray(root.detections)) {
    const d = root.detections;
    if (d.some((x) => x && typeof x === 'object' && (x.questionId || x.question_id || x.question))) {
      arr = d;
    }
  }

  if (!arr.length && root.data && typeof root.data === 'object') {
    arr = pick((/** @type {any} */ (root.data)).answers);
  }
  if (!arr.length && root.result && typeof root.result === 'object') {
    arr = pick((/** @type {any} */ (root.result)).answers);
  }
  if (!arr.length && Array.isArray(root.results)) {
    arr = root.results;
  }
  if (!arr.length && Array.isArray(root.responses)) {
    arr = root.responses;
  }
  if (!arr.length && root.answers && typeof root.answers === 'object' && !Array.isArray(root.answers)) {
    const o = /** @type {Record<string, unknown>} */ (root.answers);
    arr = Object.entries(o).map(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return { questionId: (/** @type {any} */ (v)).questionId || (/** @type {any} */ (v)).id || k, .../** @type {any} */ (v) };
      }
      return { questionId: k, value: v };
    });
  }

  if (!arr.length && Array.isArray(questions) && questions.length) {
    arr = answersFromQuestionIdKeysAtRoot(root, questions);
  }

  if (
    !arr.length &&
    Array.isArray(root.data) &&
    Array.isArray(questions) &&
    root.data.length === questions.length &&
    root.data.every((x) => x !== null && (typeof x === 'object' || typeof x === 'string' || typeof x === 'boolean'))
  ) {
    arr = root.data;
  }

  if (!arr.length) {
    const inner = maybeParseEmbeddedJsonObject(root);
    if (inner) {
      arr = coerceRawAnswersList(inner, questions, depth + 1);
    }
  }

  if (!arr.length && Array.isArray(questions) && questions.length === 1) {
    arr = singleQuestionRootFallback(root, questions[0]);
  }

  return arr.filter((x) => x != null);
}

/**
 * @param {Record<string, unknown>} a
 * @returns {unknown}
 */
function pickAnswerValue(a, depth = 0) {
  if (depth > 4 || !a || typeof a !== 'object') return undefined;
  const o = /** @type {any} */ (a);
  if (typeof o.yes === 'boolean') return o.yes ? 'yes' : 'no';
  if (typeof o.isPositive === 'boolean') return o.isPositive ? 'yes' : 'no';
  if (typeof o.detected === 'boolean') return o.detected ? 'yes' : 'no';
  if (typeof o.found === 'boolean') return o.found ? 'yes' : 'no';
  if (typeof o.count === 'number' && Number.isFinite(o.count)) return o.count > 0 ? 'yes' : 'no';
  const flat =
    o.value ??
    o.answer ??
    o.response ??
    o.resposta ??
    (typeof o.label === 'string' ? o.label : undefined) ??
    o.classification ??
    o.prediction ??
    o.outcome;
  if (flat !== undefined && flat !== null) return flat;
  if (typeof o.result === 'object' && o.result != null) {
    const inner = pickAnswerValue(o.result, depth + 1);
    if (inner !== undefined) return inner;
  }
  if (typeof o.analysis === 'object' && o.analysis != null) {
    const inner = pickAnswerValue(o.analysis, depth + 1);
    if (inner !== undefined) return inner;
  }
  if (typeof o.result === 'string' || typeof o.result === 'number' || typeof o.result === 'boolean') {
    return o.result;
  }
  return undefined;
}

/**
 * @param {Record<string, unknown>} a
 * @returns {unknown}
 */
function pickAnswerConfidence(a, depth = 0) {
  if (depth > 4 || !a || typeof a !== 'object') return undefined;
  const o = /** @type {any} */ (a);
  const c = o.confidence ?? o.score ?? o.probability ?? o.certainty;
  if (c !== undefined && c !== null) return c;
  if (typeof o.result === 'object' && o.result != null) {
    const inner = pickAnswerConfidence(o.result, depth + 1);
    if (inner !== undefined) return inner;
  }
  if (typeof o.analysis === 'object' && o.analysis != null) {
    const inner = pickAnswerConfidence(o.analysis, depth + 1);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/**
 * @param {unknown} raw
 * @param {{ id: string, text: string }} q
 * @returns {Record<string, unknown> | null}
 */
function countMatchedQuestions(rawAnswers, questions) {
  if (!Array.isArray(rawAnswers) || !Array.isArray(questions)) return 0;
  let n = 0;
  for (const q of questions) {
    if (findRawAnswerForQuestion(rawAnswers, q)) n++;
  }
  return n;
}

/**
 * Respostas em array na mesma ordem que `questions`, sem questionId (APIs YOLO/genéricas).
 * @param {unknown[]} rawAnswers
 * @param {{ id: string, text: string }[]} questions
 */
function injectQuestionIdsByIndex(rawAnswers, questions) {
  if (!Array.isArray(rawAnswers) || !Array.isArray(questions)) return rawAnswers;
  if (rawAnswers.length !== questions.length) return rawAnswers;
  if (countMatchedQuestions(rawAnswers, questions) > 0) return rawAnswers;
  return rawAnswers.map((a, i) => {
    const q = questions[i];
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      const copy = { .../** @type {any} */ (a) };
      const existing = String(copy.questionId ?? copy.question_id ?? '').trim();
      if (!existing) copy.questionId = q.id;
      return copy;
    }
    return { questionId: q.id, question: q.text, value: a };
  });
}

function findRawAnswerForQuestion(raw, q) {
  const list = Array.isArray(raw) ? raw : [];
  const qid = String(q.id);
  const qtext = normQuestionText(q.text);
  const byId = (a) => {
    if (!a || typeof a !== 'object') return false;
    const o = /** @type {any} */ (a);
    const id = String(o.questionId ?? o.question_id ?? o.qId ?? o.id ?? '').trim();
    return id === qid;
  };
  const byText = (a) => {
    if (!a || typeof a !== 'object') return false;
    const o = /** @type {any} */ (a);
    const t =
      o.question ??
      o.questionText ??
      o.query ??
      o.prompt ??
      o.labelText ??
      o.title ??
      '';
    return normQuestionText(t) === qtext && qtext.length > 0;
  };
  return /** @type {Record<string, unknown> | null} */ (list.find((a) => byId(a)) || list.find((a) => byText(a)) || null);
}

/**
 * Valida e normaliza o JSON devolvido pelo serviço externo.
 * @param {unknown} body
 * @param {{ id: string, text: string }[]} questions
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
/**
 * @param {unknown} body
 * @param {{ id: string, text: string }[]} questions
 * @param {{ visionRating0To10?: boolean }} [options]
 */
function normalizeVisionAnalyzeResponse(body, questions, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const visionRating0To10 = opts.visionRating0To10 === true;
  let data = body;
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body);
    } catch {
      return { ok: false, error: 'Resposta do serviço de visão não é JSON válido.' };
    }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Resposta do serviço de visão inválida.' };
  }
  const root = /** @type {Record<string, unknown>} */ (data);
  let rawAnswers = coerceRawAnswersList(root, questions);
  rawAnswers = injectQuestionIdsByIndex(rawAnswers, questions);

  const keysHint =
    root && typeof root === 'object'
      ? Array.isArray(root)
        ? ` A raiz do JSON é um array (${root.length} itens).`
        : ` Campos na raiz: ${Object.keys(root).slice(0, 14).join(', ')}${Object.keys(root).length > 14 ? ', …' : ''}.`
      : '';

  if (questions.length > 0 && rawAnswers.length === 0) {
    return {
      ok: false,
      error:
        'O serviço devolveu JSON sem lista utilizável de respostas. Envie "answers" (array), ou chaves na raiz iguais aos ids das perguntas (ex.: "q_1"), ou um único objeto com value/confidence se houver só uma pergunta.' +
        keysHint,
    };
  }

  const outAnswers = [];
  let matched = 0;
  const singleVisionQuestion = questions.length === 1;
  for (const q of questions) {
    const found = findRawAnswerForQuestion(rawAnswers, q);
    if (!found || typeof found !== 'object') {
      outAnswers.push({
        questionId: q.id,
        question: singleVisionQuestion ? VISION_SINGLE_ANSWER_QUESTION_LABEL : String(q.text || '').slice(0, 500),
        value: 'unknown',
        confidence: 0,
        rationale: '',
      });
      continue;
    }
    matched++;
    const val = pickAnswerValue(/** @type {Record<string, unknown>} */ (found));
    const normVal = normalizeVisionAnswerValue(val, singleVisionQuestion);
    const fo = /** @type {any} */ (found);
    const qLabel =
      fo.question != null ? String(fo.question) : fo.questionText != null ? String(fo.questionText) : q.text;
    let confVal = normalizeConfidence(pickAnswerConfidence(/** @type {Record<string, unknown>} */ (found)));
    if (
      confVal === 0 &&
      normalizeYesNo(normVal) !== 'unknown' &&
      typeof fo.count === 'number' &&
      Number.isFinite(fo.count)
    ) {
      confVal = Math.min(1, 0.42 + Math.min(Math.max(fo.count, 0), 10) * 0.055);
    }
    outAnswers.push({
      questionId: String(q.id),
      question: singleVisionQuestion
        ? VISION_SINGLE_ANSWER_QUESTION_LABEL
        : qLabel.slice(0, 500),
      value: normVal,
      confidence: confVal,
      rationale:
        found.rationale != null
          ? String(found.rationale).slice(0, 800)
          : found.explanation != null
            ? String(found.explanation).slice(0, 800)
            : '',
      evidenceTimeRanges: Array.isArray(found.evidenceTimeRanges) ? found.evidenceTimeRanges.slice(0, 8) : undefined,
      detectionIds: Array.isArray(found.detectionIds)
        ? found.detectionIds.map((x) => String(x)).slice(0, 20)
        : undefined,
      qualityFlags: Array.isArray(found.qualityFlags)
        ? found.qualityFlags.map((x) => String(x)).slice(0, 12)
        : undefined,
    });
  }

  if (questions.length > 0 && rawAnswers.length > 0 && matched === 0) {
    return {
      ok: false,
      error:
        'O serviço devolveu dados de resposta mas nenhuma entrada corresponde às perguntas enviadas. Use o mesmo "questionId" que no JSON "questions" (ex.: q_1), chaves na raiz com esses ids, ou o mesmo texto no campo "question".' +
        keysHint,
    };
  }

  const payload = {
    schemaVersion: 1,
    status: 'completed',
    processedAt: new Date().toISOString(),
    requestId: data.requestId != null ? String(data.requestId).slice(0, 120) : undefined,
    modelVersion: data.modelVersion != null ? String(data.modelVersion).slice(0, 120) : undefined,
    partial: data.partial === true,
    errors: Array.isArray(data.errors) ? data.errors.slice(0, 20) : [],
    answers: outAnswers,
    media: data.media && typeof data.media === 'object' ? data.media : undefined,
  };
  if (visionRating0To10) {
    payload.rating0To10 = pickRating0To10FromRoot(root);
  }
  return { ok: true, payload };
}

/**
 * Monta multipart/form-data (Node) para reenviar ao serviço externo.
 * @param {string} boundary
 * @param {{ name: string, value: Buffer|string, filename?: string, contentType?: string }[]} parts
 */
function buildMultipartBuffer(boundary, parts) {
  const chunks = [];
  const esc = (s) => String(s).replace(/"/g, "'");
  for (const p of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (p.filename) {
      const ct = p.contentType || 'application/octet-stream';
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${esc(p.name)}"; filename="${esc(p.filename)}"\r\nContent-Type: ${ct}\r\n\r\n`,
        ),
      );
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${esc(p.name)}"\r\n\r\n`));
    }
    chunks.push(Buffer.isBuffer(p.value) ? p.value : Buffer.from(String(p.value), 'utf8'));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

const VISION_POST_REDIRECT_MAX = 4;

/**
 * Segue redirecionamentos mantendo POST e o corpo (multipart).
 * O fetch padrão pode converter POST em GET em 301/302/303, o que leva a HTTP 405 em APIs só-POST.
 * @param {string} startUrl
 * @param {RequestInit} init
 * @returns {Promise<Response>}
 */
async function fetchVisionPostPreservingMethod(startUrl, init) {
  let url = startUrl;
  for (let hop = 0; hop < VISION_POST_REDIRECT_MAX; hop++) {
    const res = await fetch(url, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) {
      return res;
    }
    const loc = res.headers.get('location');
    if (!loc || res.status === 304) {
      return res;
    }
    url = new URL(loc, url).href;
  }
  return fetch(url, { ...init, redirect: 'manual' });
}

module.exports = {
  VISION_INTEGRATION_NAME,
  VISION_INTEGRATION_LEGACY_NAME,
  prismaWhereVisionChecklistIntegration,
  normalizeVisionAnalyzeResponse,
  buildMultipartBuffer,
  fetchVisionPostPreservingMethod,
};
