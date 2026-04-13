'use strict';

const crypto = require('crypto');
const prisma = require('../db');
const { compactSchemaOutline } = require('./formAiTemplateLibraryRag');
const { createEmbeddingVector, jsonToVector } = require('./formAiOpenAiEmbeddings');

/**
 * @param {string} title
 * @param {string | null | undefined} description
 * @param {unknown} schemaData
 * @returns {string}
 */
function buildTemplateEmbeddingSourceText(title, description, schemaData) {
  const outline = compactSchemaOutline(schemaData);
  const parts = [
    'TITLE:',
    String(title || '').trim(),
    'DESC:',
    description != null ? String(description).trim() : '',
    'STRUCTURE:',
    outline.lines.join('\n'),
  ];
  return parts.join('\n').slice(0, 24000);
}

/**
 * @param {string} s
 * @returns {string}
 */
function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

/**
 * Atualiza ou cria embedding para um modelo ativo (idempotente por hash do conteúdo).
 * @param {string} templateId
 * @returns {Promise<{ ok: boolean, skipped?: string, error?: string }>}
 */
async function syncChecklistTemplateEmbedding(templateId) {
  const id = templateId != null ? String(templateId).trim() : '';
  if (!id) return { ok: false, skipped: 'invalid_id' };

  try {
    const tpl = await prisma.checklistTemplate.findFirst({
      where: { id, isActive: true },
      select: { id: true, title: true, description: true, schemaData: true },
    });
    if (!tpl) {
      await prisma.checklistTemplateEmbedding.deleteMany({ where: { templateId: id } }).catch(() => {});
      return { ok: false, skipped: 'template_not_found_or_inactive' };
    }

    const schemaData = Array.isArray(tpl.schemaData) ? tpl.schemaData : [];
    const source = buildTemplateEmbeddingSourceText(tpl.title, tpl.description, schemaData);
    const contentHash = sha256hex(source);

    const existing = await prisma.checklistTemplateEmbedding.findUnique({
      where: { templateId: id },
      select: { contentHash: true },
    });
    if (existing && existing.contentHash === contentHash) {
      return { ok: true, skipped: 'unchanged' };
    }

    const { vector, model } = await createEmbeddingVector(source);
    const dims = vector.length;

    await prisma.checklistTemplateEmbedding.upsert({
      where: { templateId: id },
      create: {
        templateId: id,
        model,
        dims,
        contentHash,
        vector,
      },
      update: {
        model,
        dims,
        contentHash,
        vector,
      },
    });

    return { ok: true };
  } catch (e) {
    const code = e && e.code;
    if (code === 'NO_OPENAI_KEY' || code === 'EMBED_EMPTY') {
      return { ok: false, skipped: String(code), error: e.message };
    }
    console.warn('[formAiChecklistTemplateEmbed]', id, e && e.message ? e.message : e);
    return { ok: false, skipped: 'error', error: e.message || String(e) };
  }
}

/**
 * Agenda indexação em background (não bloqueia o pedido HTTP).
 * @param {string} templateId
 */
function scheduleChecklistTemplateEmbeddingSync(templateId) {
  const id = templateId != null ? String(templateId).trim() : '';
  if (!id) return;
  setImmediate(() => {
    syncChecklistTemplateEmbedding(id).catch((e) => {
      console.warn('[scheduleChecklistTemplateEmbeddingSync]', e && e.message ? e.message : e);
    });
  });
}

/**
 * @param {unknown} raw
 * @returns {number[] | null}
 */
function vectorFromRow(raw) {
  return jsonToVector(raw);
}

module.exports = {
  buildTemplateEmbeddingSourceText,
  syncChecklistTemplateEmbedding,
  scheduleChecklistTemplateEmbeddingSync,
  vectorFromRow,
  sha256hex,
};
