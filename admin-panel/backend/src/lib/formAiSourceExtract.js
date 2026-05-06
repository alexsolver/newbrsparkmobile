'use strict';

const mammoth = require('mammoth');
const { extractWorkbookForAi, MAX_CANONICAL_CHARS } = require('./formAiExtract');
const { extractPdfForAi, extractImageOcrForAi } = require('./formAiPdfImageExtract');
const { ALLOWED_FIELD_TYPES } = require('./formAiFieldCatalog');
const { tryExternalFormJsonToMarkdown } = require('./formAiExternalFormJson');

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ markdown: string, truncated: boolean, format: string, columnSignals: object[] }>}
 */
async function extractDocxForAi(buffer) {
  const { value } = await mammoth.convertToMarkdown({ buffer });
  let markdown = String(value || '').trim();
  if (!markdown) markdown = '(Documento vazio ou sem texto extraível.)';
  markdown = '## Documento Word\n\n' + markdown;
  let truncated = false;
  if (markdown.length > MAX_CANONICAL_CHARS) {
    markdown = markdown.slice(0, MAX_CANONICAL_CHARS);
    truncated = true;
  }
  return { markdown, truncated, format: 'docx', columnSignals: [] };
}

/**
 * Array parece schemaData Aria (tipos conhecidos; campos com label exceto section_break).
 * @param {unknown[]} arr
 * @returns {boolean}
 */
function looksLikeAriaSchemaArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  for (const x of arr) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
    const rawT = x.type;
    if (rawT == null || String(rawT).trim() === '') return false;
    const t = String(rawT)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (!ALLOWED_FIELD_TYPES.has(t)) return false;
    if (t !== 'section_break') {
      const lab = x.label != null ? String(x.label).trim() : '';
      if (!lab) return false;
    }
  }
  return true;
}

/**
 * @param {Buffer} buffer
 * @returns {{ schemaArray: object[], title: string, description: string } | null}
 */
function tryAriaJsonImport(buffer) {
  const text = buffer.toString('utf8').trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const arr = Array.isArray(data) ? data : data && Array.isArray(data.schemaData) ? data.schemaData : null;
  if (!arr || !looksLikeAriaSchemaArray(arr)) return null;
  const envelope = Array.isArray(data) ? {} : data;
  const title = typeof envelope.title === 'string' ? envelope.title.trim() : '';
  const description = typeof envelope.description === 'string' ? envelope.description.trim() : '';
  return { schemaArray: arr, title, description };
}

/**
 * JSON genérico → markdown para o LLM.
 * @param {Buffer} buffer
 */
function extractJsonDocumentForAi(buffer) {
  const text = buffer.toString('utf8').trim();
  if (!text) throw new Error('Arquivo JSON vazio.');
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error('JSON inválido: ' + e.message);
  }
  const pretty = JSON.stringify(obj, null, 2);
  let truncated = false;
  let body = pretty;
  const maxBody = MAX_CANONICAL_CHARS - 250;
  if (body.length > maxBody) {
    body = body.slice(0, maxBody);
    truncated = true;
  }
  const markdown = `## Dados JSON\n\n\`\`\`json\n${body}\n\`\`\`\n`;
  return { markdown, truncated, format: 'json', columnSignals: [] };
}

/**
 * Excel | Word | PDF | Imagem (OCR) | JSON (schema Aria ou texto para IA).
 * @param {Buffer} buffer
 * @param {string} ext — ex.: ".docx"
 * @param {string} [_originalName]
 * @returns {Promise<
 *   | ({ kind: 'tabular' } & Awaited<ReturnType<typeof extractWorkbookForAi>>)
 *   | ({ kind: 'document' } & Awaited<ReturnType<typeof extractDocxForAi>>)
 *   | ({ kind: 'document' } & ReturnType<typeof extractJsonDocumentForAi>)
 *   | { kind: 'aria_schema'; schemaArray: object[]; title: string; description: string; markdown: string; columnSignals: []; truncated: boolean; format: string }
 * >}
 */
async function extractSourceForFormAi(buffer, ext, _originalName) {
  const e = String(ext || '').toLowerCase();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Arquivo vazio.');
  }

  if (e === '.xlsx' || e === '.xlsm') {
    const snap = await extractWorkbookForAi(buffer);
    return { ...snap, kind: 'tabular' };
  }

  if (e === '.docx') {
    const snap = await extractDocxForAi(buffer);
    return { ...snap, kind: 'document' };
  }

  if (e === '.pdf') {
    const snap = await extractPdfForAi(buffer);
    return { ...snap, kind: 'document' };
  }

  if (e === '.png' || e === '.jpg' || e === '.jpeg' || e === '.webp') {
    const snap = await extractImageOcrForAi(buffer);
    return { ...snap, kind: 'document' };
  }

  if (e === '.json') {
    const br = tryAriaJsonImport(buffer);
    if (br) {
      return {
        kind: 'aria_schema',
        schemaArray: br.schemaArray,
        title: br.title,
        description: br.description,
        markdown: '',
        columnSignals: [],
        truncated: false,
        format: 'json',
      };
    }
    const extForm = tryExternalFormJsonToMarkdown(buffer);
    if (extForm && String(extForm.markdown || '').trim().length >= 3) {
      return {
        kind: 'document',
        markdown: extForm.markdown,
        truncated: !!extForm.truncated,
        format: extForm.format || 'json_external_form',
        columnSignals: Array.isArray(extForm.columnSignals) ? extForm.columnSignals : [],
        extraWarnings: Array.isArray(extForm.warnings) ? extForm.warnings : [],
      };
    }
    const snap = extractJsonDocumentForAi(buffer);
    return { ...snap, kind: 'document', extraWarnings: [] };
  }

  throw new Error(
    `Formato não suportado (${e || 'desconhecido'}). Use .xlsx, .xlsm, .docx, .pdf, .png, .jpg, .jpeg, .webp ou .json.`
  );
}

const SUPPORTED_FORM_AI_EXTENSIONS = [
  '.xlsx',
  '.xlsm',
  '.docx',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.json',
];

module.exports = {
  extractSourceForFormAi,
  tryAriaJsonImport,
  looksLikeAriaSchemaArray,
  SUPPORTED_FORM_AI_EXTENSIONS,
  MAX_CANONICAL_CHARS,
};
