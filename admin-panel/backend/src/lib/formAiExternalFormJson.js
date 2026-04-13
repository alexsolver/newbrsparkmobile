'use strict';

const { MAX_CANONICAL_CHARS } = require('./formAiExtract');

/**
 * @param {string} s
 * @returns {string}
 */
function escapeMdLine(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

/**
 * @param {unknown} v
 * @returns {string[]}
 */
function collectChoiceLabels(v) {
  const out = [];
  const opts = v && typeof v === 'object' && Array.isArray(v.options) ? v.options : [];
  for (const o of opts) {
    if (!o || typeof o !== 'object') continue;
    if (o.isOther === true || o.isOther === 'true') {
      out.push('Outro');
      continue;
    }
    const val = o.value != null ? String(o.value).trim() : '';
    if (val) out.push(val);
  }
  return out;
}

/**
 * @param {number} idx
 * @param {string} itemTitle
 * @param {{ question?: Record<string, unknown> }} questionItem
 * @returns {string[]}
 */
function linesForGoogleQuestion(idx, itemTitle, questionItem) {
  const q = questionItem && questionItem.question && typeof questionItem.question === 'object' ? questionItem.question : {};
  const title = escapeMdLine(itemTitle || (q.title != null ? String(q.title) : '') || '(sem título)');
  const req = q.required === true || q.required === 'true';
  const lines = [];
  lines.push(`\n#### Pergunta ${idx}: ${title}`);
  lines.push(`- **Obrigatório (origem):** ${req ? 'sim' : 'não'}`);

  if (q.textQuestion && typeof q.textQuestion === 'object') {
    const par = q.textQuestion.paragraph === true || q.textQuestion.paragraph === 'true';
    lines.push(`- **Tipo original:** texto ${par ? 'longo (parágrafo)' : 'curto'}`);
    return lines;
  }
  if (q.choiceQuestion && typeof q.choiceQuestion === 'object') {
    const cq = q.choiceQuestion;
    const typ = cq.type != null ? String(cq.type) : 'CHOICE';
    const labels = collectChoiceLabels(cq);
    lines.push(`- **Tipo original:** escolha (${typ})`);
    if (labels.length) lines.push(`- **Opções:** ${labels.map(escapeMdLine).join(' · ')}`);
    return lines;
  }
  if (q.scaleQuestion && typeof q.scaleQuestion === 'object') {
    const s = q.scaleQuestion;
    const low = s.low != null ? String(s.low) : '';
    const high = s.high != null ? String(s.high) : '';
    lines.push(`- **Tipo original:** escala (${low}–${high})`);
    if (s.lowLabel) lines.push(`- **Rótulo mínimo:** ${escapeMdLine(s.lowLabel)}`);
    if (s.highLabel) lines.push(`- **Rótulo máximo:** ${escapeMdLine(s.highLabel)}`);
    return lines;
  }
  if (q.dateQuestion) {
    lines.push('- **Tipo original:** data (e eventualmente hora)');
    return lines;
  }
  if (q.timeQuestion) {
    lines.push('- **Tipo original:** hora');
    return lines;
  }
  if (q.fileUploadQuestion) {
    lines.push('- **Tipo original:** envio de arquivo');
    return lines;
  }
  if (q.rowQuestion && typeof q.rowQuestion === 'object') {
    lines.push('- **Tipo original:** grelha / linha (matrix)');
    return lines;
  }
  lines.push('- **Tipo original:** (outro — inferir no BrSpark)');
  return lines;
}

/**
 * @param {Record<string, unknown>} root
 * @returns {{ markdown: string, warnings: string[] } | null}
 */
function googleFormsJsonToMarkdown(root) {
  const items = Array.isArray(root.items) ? root.items : null;
  if (!items || !items.length) return null;
  let hits = 0;
  for (const it of items) {
    if (it && typeof it === 'object' && (it.questionItem || it.pageBreakItem || it.groupItem)) {
      hits += 1;
      break;
    }
  }
  if (!hits) return null;

  const info = root.info && typeof root.info === 'object' ? root.info : {};
  const formTitle = escapeMdLine(
    (info.title != null ? String(info.title) : '') ||
      (info.documentTitle != null ? String(info.documentTitle) : '') ||
      'Formulário Google Forms',
  );
  const formDesc = info.description != null ? escapeMdLine(String(info.description)) : '';

  const parts = [];
  parts.push('## JSON de formulário externo (Google Forms / API compatível)\n');
  parts.push(`**Título:** ${formTitle}`);
  if (formDesc) parts.push(`**Descrição (origem):** ${formDesc}`);
  parts.push('\n> Use cada bloco abaixo como um campo candidato no BrSpark. Quebras de página viram etapas (`section_break`).\n');

  let qIdx = 0;
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    if (it.pageBreakItem) {
      const t = escapeMdLine(it.title != null ? String(it.title) : 'Nova secção');
      parts.push(`\n### Etapa (quebra de página): ${t}\n`);
      continue;
    }
    if (it.textItem || it.imageItem || it.videoItem) {
      const t = escapeMdLine(it.title != null ? String(it.title) : '');
      if (t) parts.push(`\n- **Conteúdo / mídia (não é pergunta):** ${t}\n`);
      continue;
    }
    if (it.questionItem && typeof it.questionItem === 'object') {
      qIdx += 1;
      const title = it.title != null ? String(it.title) : '';
      parts.push(linesForGoogleQuestion(qIdx, title, it.questionItem).join('\n'));
      continue;
    }
    if (it.groupItem && typeof it.groupItem === 'object') {
      const g = it.groupItem;
      const gTitle = escapeMdLine(it.title != null ? String(it.title) : 'Grupo de perguntas');
      parts.push(`\n### Grupo: ${gTitle}`);
      const nested = Array.isArray(g.questions) ? g.questions : [];
      for (const sub of nested) {
        if (!sub || typeof sub !== 'object') continue;
        if (sub.questionItem && typeof sub.questionItem === 'object') {
          qIdx += 1;
          const st = sub.title != null ? String(sub.title) : '';
          parts.push(linesForGoogleQuestion(qIdx, st || gTitle, sub.questionItem).join('\n'));
        }
      }
    }
  }

  return { markdown: parts.join('\n'), warnings: [] };
}

/**
 * @param {Record<string, unknown>} root
 * @returns {{ markdown: string, warnings: string[] } | null}
 */
function microsoftFormsLikeToMarkdown(root) {
  const raw =
    (Array.isArray(root.questions) && root.questions) ||
    (Array.isArray(root.Questions) && root.Questions) ||
    (Array.isArray(root.questionList) && root.questionList) ||
    null;
  if (!raw || !raw.length) return null;
  const title = escapeMdLine(
    (root.title != null ? String(root.title) : '') ||
      (root.formTitle != null ? String(root.formTitle) : '') ||
      'Formulário (JSON)',
  );
  const parts = [];
  parts.push('## JSON de formulário externo (estrutura tipo Microsoft Forms / lista de perguntas)\n');
  parts.push(`**Título:** ${title}\n`);
  let i = 0;
  for (const q of raw) {
    if (!q || typeof q !== 'object') continue;
    i += 1;
    const qt = escapeMdLine(
      (q.title != null ? String(q.title) : '') ||
        (q.questionText != null ? String(q.questionText) : '') ||
        (q.name != null ? String(q.name) : '') ||
        `(pergunta ${i})`,
    );
    const typ = q.type != null ? String(q.type) : q.questionType != null ? String(q.questionType) : '';
    parts.push(`\n#### Pergunta ${i}: ${qt}`);
    if (typ) parts.push(`- **Tipo original:** ${escapeMdLine(typ)}`);
    const opts = q.choices || q.options || q.Choices;
    if (Array.isArray(opts) && opts.length) {
      const labels = opts
        .map((c) => {
          if (!c || typeof c !== 'object') return c != null ? String(c) : '';
          return c.text != null ? String(c.text) : c.value != null ? String(c.value) : '';
        })
        .filter(Boolean);
      if (labels.length) parts.push(`- **Opções:** ${labels.map(escapeMdLine).join(' · ')}`);
    }
  }
  if (i === 0) return null;
  return { markdown: parts.join('\n'), warnings: [] };
}

/**
 * @param {Record<string, unknown>} root
 * @returns {{ markdown: string, warnings: string[] } | null}
 */
function typeformLikeToMarkdown(root) {
  const fields =
    (Array.isArray(root.fields) && root.fields) ||
    (Array.isArray(root.questions) && root.questions) ||
    null;
  if (!fields || !fields.length) return null;
  const hasTypeformShape = fields.some(
    (f) => f && typeof f === 'object' && (f.type != null || f.ref != null) && (f.title != null || f.properties),
  );
  if (!hasTypeformShape) return null;

  const title = escapeMdLine(
    (root.title != null ? String(root.title) : '') ||
      (root.form_title != null ? String(root.form_title) : '') ||
      'Formulário Typeform / similar',
  );
  const parts = [];
  parts.push('## JSON de formulário externo (Typeform ou API semelhante)\n');
  parts.push(`**Título:** ${title}\n`);
  let i = 0;
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;
    i += 1;
    const qt = escapeMdLine((f.title != null ? String(f.title) : '') || `(campo ${i})`);
    const typ = f.type != null ? String(f.type) : '';
    parts.push(`\n#### Campo ${i}: ${qt}`);
    if (typ) parts.push(`- **Tipo original:** ${escapeMdLine(typ)}`);
    const props = f.properties && typeof f.properties === 'object' ? f.properties : {};
    const ch = props.choices;
    if (Array.isArray(ch) && ch.length) {
      const labels = ch
        .map((c) => (c && typeof c === 'object' && c.label != null ? String(c.label) : ''))
        .filter(Boolean);
      if (labels.length) parts.push(`- **Opções:** ${labels.map(escapeMdLine).join(' · ')}`);
    }
  }
  return { markdown: parts.join('\n'), warnings: [] };
}

/**
 * @param {Record<string, unknown>} root
 * @returns {{ markdown: string, warnings: string[] } | null}
 */
function genericFieldsArrayToMarkdown(root) {
  const arr =
    (Array.isArray(root.fields) && root.fields) ||
    (Array.isArray(root.elements) && root.elements) ||
    (Array.isArray(root.items) && root.items) ||
    null;
  if (!arr || !arr.length) return null;
  const score = arr.filter((x) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
    const lab =
      (x.label != null && String(x.label).trim()) ||
      (x.title != null && String(x.title).trim()) ||
      (x.name != null && String(x.name).trim()) ||
      (x.question != null && String(x.question).trim());
    const typ = x.type != null || x.fieldType != null || x.inputType != null;
    return !!(lab && typ);
  }).length;
  if (score < Math.min(2, arr.length)) return null;

  const title = escapeMdLine(
    (root.title != null ? String(root.title) : '') ||
      (root.formName != null ? String(root.formName) : '') ||
      'Formulário (JSON genérico)',
  );
  const parts = [];
  parts.push('## JSON de formulário externo (lista genérica de campos)\n');
  parts.push(`**Título:** ${title}\n`);
  let i = 0;
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const lab =
      (x.label != null && String(x.label).trim()) ||
      (x.title != null && String(x.title).trim()) ||
      (x.name != null && String(x.name).trim()) ||
      (x.question != null && String(x.question).trim());
    if (!lab) continue;
    i += 1;
    const typ =
      (x.type != null ? String(x.type) : '') ||
      (x.fieldType != null ? String(x.fieldType) : '') ||
      (x.inputType != null ? String(x.inputType) : '');
    parts.push(`\n#### Campo ${i}: ${escapeMdLine(lab)}`);
    if (typ) parts.push(`- **Tipo original:** ${escapeMdLine(typ)}`);
    const opts = x.options || x.choices || x.values;
    if (Array.isArray(opts) && opts.length) {
      const labels = opts
        .map((o) => {
          if (o == null) return '';
          if (typeof o === 'string' || typeof o === 'number') return String(o);
          if (typeof o === 'object' && o.label != null) return String(o.label);
          if (typeof o === 'object' && o.value != null) return String(o.value);
          if (typeof o === 'object' && o.text != null) return String(o.text);
          return '';
        })
        .filter(Boolean);
      if (labels.length) parts.push(`- **Opções:** ${labels.map(escapeMdLine).join(' · ')}`);
    }
  }
  if (i === 0) return null;
  return { markdown: parts.join('\n'), warnings: ['Heurística genérica: confira se a ordem e os rótulos batem com o sistema de origem.'] };
}

/**
 * Tenta converter JSON de Google Forms, Microsoft Forms, Typeform ou listas genéricas em Markdown para a IA.
 * @param {Buffer} buffer
 * @returns {{ markdown: string, truncated: boolean, format: string, columnSignals: object[], warnings: string[] } | null}
 */
function tryExternalFormJsonToMarkdown(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const text = buffer.toString('utf8').trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return null;
  }
  /** @type {Record<string, unknown>} */
  let obj;
  if (Array.isArray(root)) {
    const objs = root.filter((x) => x && typeof x === 'object' && !Array.isArray(x));
    const looksLikeFieldRows = objs.length > 0 && objs.every(
      (x) =>
        !!(x.title || x.label || x.name || x.question) &&
        !!(x.type || x.fieldType || x.inputType || x.questionType),
    );
    const looksLikeGoogleItems = objs.some(
      (x) => x.questionItem || x.pageBreakItem || x.groupItem || x.textItem || x.imageItem || x.videoItem,
    );
    if (looksLikeGoogleItems) obj = { items: objs };
    else if (looksLikeFieldRows) obj = { title: 'Formulário (JSON em array)', fields: objs };
    else obj = { items: objs };
  } else {
    obj = /** @type {Record<string, unknown>} */ (root);
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  let converted = googleFormsJsonToMarkdown(/** @type {Record<string, unknown>} */ (obj));
  let format = 'json_google_forms';
  if (!converted) {
    converted = microsoftFormsLikeToMarkdown(/** @type {Record<string, unknown>} */ (obj));
    format = 'json_ms_forms';
  }
  if (!converted) {
    converted = typeformLikeToMarkdown(/** @type {Record<string, unknown>} */ (obj));
    format = 'json_typeform';
  }
  if (!converted) {
    converted = genericFieldsArrayToMarkdown(/** @type {Record<string, unknown>} */ (obj));
    format = 'json_external_form';
  }
  if (!converted) return null;

  let markdown = converted.markdown;
  const warnings = Array.isArray(converted.warnings) ? [...converted.warnings] : [];
  let truncated = false;
  const maxBody = MAX_CANONICAL_CHARS - 400;
  if (markdown.length > maxBody) {
    markdown = markdown.slice(0, maxBody) + '\n\n…[conteúdo truncado]\n';
    truncated = true;
    warnings.push('Conteúdo normalizado do JSON foi truncado por limite de tamanho.');
  }

  return { markdown, truncated, format, columnSignals: [], warnings };
}

module.exports = {
  tryExternalFormJsonToMarkdown,
};
