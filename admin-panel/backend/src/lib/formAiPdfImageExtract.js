'use strict';

const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { MAX_CANONICAL_CHARS } = require('./formAiExtract');

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ markdown: string, truncated: boolean, format: string, columnSignals: object[] }>}
 */
async function extractPdfForAi(buffer) {
  let text = '';
  try {
    const data = await pdfParse(buffer);
    text = String(data.text || '').trim();
  } catch (e) {
    throw new Error('Não foi possível ler o PDF: ' + (e.message || String(e)));
  }
  if (!text) {
    text =
      '(Nenhum texto extraível neste PDF — pode ser só imagens digitalizadas. Experimente exportar como imagem e enviar o ficheiro de imagem para OCR.)';
  }
  let markdown = '## Documento PDF\n\n' + text;
  let truncated = false;
  if (markdown.length > MAX_CANONICAL_CHARS) {
    markdown = markdown.slice(0, MAX_CANONICAL_CHARS);
    truncated = true;
  }
  return { markdown, truncated, format: 'pdf', columnSignals: [] };
}

/**
 * OCR em imagem (formulário em papel, captura de ecrã, etc.).
 * @param {Buffer} buffer
 * @param {string} [mimeHint] ex.: image/png
 * @returns {Promise<{ markdown: string, truncated: boolean, format: string, columnSignals: object[] }>}
 */
async function extractImageOcrForAi(buffer) {
  const worker = await createWorker('por+eng', 1, { logger: () => {} });
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    let raw = String(text || '').trim();
    if (!raw) {
      raw =
        '(OCR não reconheceu texto na imagem — tente imagem mais nítida, melhor contraste ou rotação correta.)';
    }
    let markdown = '## Texto reconhecido na imagem (OCR)\n\n' + raw;
    let truncated = false;
    if (markdown.length > MAX_CANONICAL_CHARS) {
      markdown = markdown.slice(0, MAX_CANONICAL_CHARS);
      truncated = true;
    }
    return { markdown, truncated, format: 'image_ocr', columnSignals: [] };
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  extractPdfForAi,
  extractImageOcrForAi,
};
