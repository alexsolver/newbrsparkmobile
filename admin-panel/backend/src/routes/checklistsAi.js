'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const { adminAuthThenPanel } = require('../middleware/auth');
const { extractSourceForFormAi, SUPPORTED_FORM_AI_EXTENSIONS } = require('../lib/formAiSourceExtract');
const {
  normalizeProposalsFromLlm,
  buildSchemaFromProposalSelections,
  sanitizeTemplateText,
  normalizeSchemaDataFromLlm,
} = require('../lib/formAiNormalize');
const { generateSchemaFromCanonical, analyzeSpreadsheetStructure } = require('../lib/formAiLlm');
const { suggestLogicRules } = require('../lib/formAiCopilot');
const { parseFormContextFromOptions } = require('../lib/formAiContext');
const { executeCopilotChatSession } = require('../lib/formAiCopilotSession');
const {
  fetchMultipleReferenceUrlsForCopilot,
  normalizeHttpsReferenceUrls,
} = require('../lib/formAiDocumentationFetch');

const router = express.Router();

function schemaDataToAnalyzeBlocks(schemaData) {
  return schemaData.map((f, i) => ({
    key: `b${i}`,
    kind: f.type === 'section_break' ? 'section_break' : 'field',
    label: (() => {
      const lab = f.label != null ? String(f.label).trim() : '';
      if (lab) return lab;
      return f.type === 'section_break' ? `Etapa ${i + 1}` : 'Campo';
    })(),
    context: f.type === 'section_break' ? 'Schema JSON BrSpark' : `Schema JSON · ${f.type}`,
  }));
}

function titleFromBrsparkImport(snapTitle, schemaData) {
  const t = sanitizeTemplateText(snapTitle, 200);
  if (t) return t;
  const sec = schemaData.find((x) => x.type === 'section_break' && x.label && String(x.label).trim());
  if (sec) return sanitizeTemplateText(String(sec.label).trim(), 200);
  return 'Formulário importado (JSON)';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * POST /api/checklists/ai/analyze-from-file
 * multipart: file (.xlsx, .xlsm, .docx, .pdf, imagens, .json), optional "options" JSON { hint?: string }
 * Resposta: title, description, blocks, warnings, truncated, source
 */
router.post('/ai/analyze-from-file', adminAuthThenPanel, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Envie um arquivo no campo "file".' });
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!SUPPORTED_FORM_AI_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        error: `Formato não suportado. Use: ${SUPPORTED_FORM_AI_EXTENSIONS.join(', ')}.`,
      });
    }

    let options = {};
    if (req.body && typeof req.body.options === 'string' && req.body.options.trim()) {
      try {
        options = JSON.parse(req.body.options);
      } catch {
        return res.status(400).json({ error: 'Campo "options" deve ser JSON válido.' });
      }
    }

    let snapshot;
    try {
      snapshot = await extractSourceForFormAi(file.buffer, ext, file.originalname);
    } catch (e) {
      console.error('[checklists/ai] extract source:', e);
      return res.status(400).json({ error: e.message || 'Não foi possível ler o arquivo.' });
    }

    if (snapshot.kind === 'brspark_schema') {
      const { schemaData, warnings: wNorm } = normalizeSchemaDataFromLlm(snapshot.schemaArray);
      if (!schemaData.length) {
        return res.status(400).json({ error: 'O JSON não produziu campos válidos após validação.' });
      }
      const title = titleFromBrsparkImport(snapshot.title, schemaData);
      const description = sanitizeTemplateText(snapshot.description, 500);
      const blocks = schemaDataToAnalyzeBlocks(schemaData);
      return res.json({
        ok: true,
        title,
        description,
        blocks,
        warnings: [
          ...wNorm,
          'Importação direta: arquivo JSON reconhecido como schema BrSpark (sem chamada à IA).',
        ],
        truncated: false,
        source: {
          format: snapshot.format,
          name: file.originalname || null,
          importKind: 'brspark_schema',
        },
      });
    }

    if (!snapshot.markdown || snapshot.markdown.length < 3) {
      return res.status(400).json({ error: 'O arquivo parece vazio ou sem texto extraível.' });
    }

    const formContext = parseFormContextFromOptions(options);
    const userHint = typeof options.hint === 'string' ? String(options.hint).trim() : '';

    let analyzed;
    try {
      analyzed = await analyzeSpreadsheetStructure({
        markdown: snapshot.markdown,
        userHint,
        columnSignals: snapshot.columnSignals || [],
        formContext,
        sourceFormat: snapshot.format,
      });
    } catch (e) {
      if (e.code === 'NO_OPENAI_KEY') {
        return res.status(503).json({
          error: e.message,
          code: 'NO_OPENAI_KEY',
        });
      }
      console.error('[checklists/ai] analyze llm:', e);
      return res.status(502).json({ error: 'Falha ao analisar com IA: ' + e.message });
    }

    const snapExtra = Array.isArray(snapshot.extraWarnings) ? snapshot.extraWarnings : [];
    const truncWarn = snapshot.truncated ? ['Conteúdo truncado por limite de tamanho.'] : [];
    res.json({
      ok: true,
      title: analyzed.title,
      description: analyzed.description,
      blocks: analyzed.blocks,
      warnings: [...snapExtra, ...(analyzed.warnings || []), ...truncWarn],
      truncated: !!snapshot.truncated,
      source: { format: snapshot.format, name: file.originalname || null },
    });
  } catch (err) {
    console.error('[checklists/ai] analyze-from-file:', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

/**
 * POST /api/checklists/ai/build-form
 * JSON: { title?, description?, items: [...], selections: { [itemKey]: { optionKey?, required?, options? } } }
 */
router.post('/ai/build-form', adminAuthThenPanel, async (req, res) => {
  try {
    const body = req.body || {};
    const { items: rawItems, selections } = body;
    if (!rawItems || !Array.isArray(rawItems)) {
      return res.status(400).json({ error: 'Corpo inválido: falta "items" (array).' });
    }
    const { items, warnings: w1 } = normalizeProposalsFromLlm({ items: rawItems }, {});
    if (!items.length) {
      return res.status(400).json({ error: 'Lista "items" vazia ou inválida após validação.' });
    }
    const title = sanitizeTemplateText(body.title, 200) || 'Formulário (IA)';
    const description = sanitizeTemplateText(body.description, 500);
    const { schemaData, warnings: w2 } = buildSchemaFromProposalSelections(items, selections);
    res.json({
      ok: true,
      title,
      description,
      schemaData,
      warnings: [...w1, ...w2],
    });
  } catch (err) {
    console.error('[checklists/ai] build-form:', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

/**
 * POST /api/checklists/ai/draft-from-file
 * multipart: file (.xlsx, .xlsm, .docx, .pdf, imagens, .json), optional "options" JSON { hint?: string }
 */
router.post('/ai/draft-from-file', adminAuthThenPanel, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Envie um arquivo no campo "file".' });
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!SUPPORTED_FORM_AI_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        error: `Formato não suportado. Use: ${SUPPORTED_FORM_AI_EXTENSIONS.join(', ')}.`,
      });
    }

    let options = {};
    if (req.body && typeof req.body.options === 'string' && req.body.options.trim()) {
      try {
        options = JSON.parse(req.body.options);
      } catch {
        return res.status(400).json({ error: 'Campo "options" deve ser JSON válido.' });
      }
    }

    let snapshot;
    try {
      snapshot = await extractSourceForFormAi(file.buffer, ext, file.originalname);
    } catch (e) {
      console.error('[checklists/ai] extract source (draft):', e);
      return res.status(400).json({ error: e.message || 'Não foi possível ler o arquivo.' });
    }

    if (snapshot.kind === 'brspark_schema') {
      const { schemaData, warnings: wNorm } = normalizeSchemaDataFromLlm(snapshot.schemaArray);
      if (!schemaData.length) {
        return res.status(400).json({ error: 'O JSON não produziu campos válidos após validação.' });
      }
      const title = titleFromBrsparkImport(snapshot.title, schemaData);
      const description = sanitizeTemplateText(snapshot.description, 500);
      return res.json({
        ok: true,
        title,
        description,
        schemaData,
        warnings: [
          ...wNorm,
          'Importação direta: schema BrSpark em JSON (sem IA).',
        ],
        truncated: false,
        source: {
          format: snapshot.format,
          name: file.originalname || null,
          importKind: 'brspark_schema',
        },
      });
    }

    if (!snapshot.markdown || snapshot.markdown.length < 3) {
      return res.status(400).json({ error: 'O arquivo parece vazio ou sem texto extraível.' });
    }

    const formContext = parseFormContextFromOptions(options);
    const userHint = typeof options.hint === 'string' ? String(options.hint).trim() : '';

    let generated;
    try {
      generated = await generateSchemaFromCanonical({
        markdown: snapshot.markdown,
        userHint,
        columnSignals: snapshot.columnSignals || [],
        formContext,
        sourceFormat: snapshot.format,
      });
    } catch (e) {
      if (e.code === 'NO_OPENAI_KEY') {
        return res.status(503).json({
          error: e.message,
          code: 'NO_OPENAI_KEY',
        });
      }
      console.error('[checklists/ai] llm:', e);
      return res.status(502).json({ error: 'Falha ao gerar formulário com IA: ' + e.message });
    }

    const snapExtraDraft = Array.isArray(snapshot.extraWarnings) ? snapshot.extraWarnings : [];
    res.json({
      ok: true,
      title: generated.title,
      description: generated.description,
      schemaData: generated.schemaData,
      metadata: generated.metadata && typeof generated.metadata === 'object' ? generated.metadata : {},
      warnings: [
        ...snapExtraDraft,
        ...(generated.warnings || []),
        ...(snapshot.truncated ? ['Conteúdo truncado por limite de tamanho.'] : []),
      ],
      truncated: !!snapshot.truncated,
      source: { format: snapshot.format, name: file.originalname || null },
    });
  } catch (err) {
    console.error('[checklists/ai] draft-from-file:', err);
    res.status(500).json({ error: err.message || 'Erro interno.' });
  }
});

/**
 * POST /api/checklists/ai/session/chat
 * JSON: { messages, schemaData?, formContext?, spreadsheetSummary?, templateId?, skipTemplateLibraryRag?, skipTemplateEmbeddings?, documentationUrl?, referenceUrls?: string[], copilotMode?: "auto"|"create"|"refine"|"troubleshoot"|"rules"|"import_assist"|"explain" }
 */
router.post('/ai/session/chat', adminAuthThenPanel, async (req, res) => {
  try {
    const { out, ragMeta, ragLibraryMeta, documentationFetch } = await executeCopilotChatSession({
      body: req.body || {},
      admin: req.admin,
    });
    res.json({ ok: true, ...out, ragMeta, ragLibraryMeta, documentationFetch });
  } catch (e) {
    if (e.code === 'BAD_REQUEST') {
      return res.status(400).json({ error: e.message });
    }
    if (e.code === 'NO_OPENAI_KEY') {
      return res.status(503).json({ error: e.message, code: 'NO_OPENAI_KEY' });
    }
    if (e.code === 'OPENAI_BAD_RESPONSE' || e.code === 'OPENAI_JSON_INVALID') {
      return res.status(502).json({ error: e.message, code: e.code });
    }
    console.error('[checklists/ai] session/chat:', e);
    res.status(502).json({ error: e.message || 'Falha no Composer IA.', code: e.code || 'COPILOT_CHAT_FAILED' });
  }
});

/**
 * POST /api/checklists/ai/session/chat-stream
 * Mesmo corpo que /ai/session/chat; resposta **SSE** (text/event-stream): eventos `progress` e `result` ou `error`.
 */
router.post('/ai/session/chat-stream', adminAuthThenPanel, async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'Envie "messages" (array não vazio).' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const { out, ragMeta, ragLibraryMeta, documentationFetch } = await executeCopilotChatSession({
      body,
      admin: req.admin,
      onProgress: (ev) => send({ type: 'progress', ...ev }),
    });
    send({
      type: 'result',
      payload: { ok: true, ...out, ragMeta, ragLibraryMeta, documentationFetch },
    });
    res.end();
  } catch (e) {
    send({
      type: 'error',
      error: e.message || 'Falha no Composer IA.',
      code: e.code || null,
    });
    res.end();
  }
});

/**
 * POST /api/checklists/ai/suggest-logic
 * JSON: { schemaData: [], userGoal: string, formContext?: {}, documentationUrl?: string, referenceUrls?: string[] }
 */
router.post('/ai/suggest-logic', adminAuthThenPanel, async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.schemaData)) {
      return res.status(400).json({ error: 'Envie "schemaData" (array).' });
    }
    const userGoal = typeof body.userGoal === 'string' ? body.userGoal.trim() : '';
    if (!userGoal) {
      return res.status(400).json({ error: 'Envie "userGoal" (texto).' });
    }
    const formContext = parseFormContextFromOptions(body.formContext || {});

    let documentationFetchedText = '';
    let documentationFetchWarning = '';
    const documentationFetch = {
      attempted: false,
      ok: false,
      chars: 0,
      error: null,
      url: null,
    };

    const refFromArray = [];
    if (Array.isArray(body.referenceUrls)) {
      for (const x of body.referenceUrls) {
        if (x != null && String(x).trim()) refFromArray.push(String(x).trim().slice(0, 2048));
      }
    }
    const legacyDoc =
      typeof body.documentationUrl === 'string' ? String(body.documentationUrl).trim().slice(0, 2048) : '';
    if (legacyDoc) refFromArray.unshift(legacyDoc);
    const urlsNormalized = normalizeHttpsReferenceUrls(refFromArray, 5);

    if (urlsNormalized.length > 0) {
      documentationFetch.attempted = true;
      documentationFetch.url = urlsNormalized[0];
      documentationFetch.urls = urlsNormalized;
      documentationFetch.referenceCount = urlsNormalized.length;
      const multi = await fetchMultipleReferenceUrlsForCopilot(urlsNormalized);
      documentationFetchedText = multi.combinedText || '';
      documentationFetch.items = multi.items;
      documentationFetch.ok = multi.items.some((it) => it && it.ok);
      documentationFetch.chars = documentationFetchedText.length;
      if (multi.warnings && multi.warnings.length) {
        documentationFetchWarning = `Referências web: ${multi.warnings.join(' | ')}`;
      }
    }

    const out = await suggestLogicRules(body.schemaData, userGoal, formContext, {
      documentationFetchedText: documentationFetchedText || undefined,
      documentationFetchWarning: documentationFetchWarning || undefined,
    });
    res.json({ ok: true, ...out, documentationFetch });
  } catch (e) {
    if (e.code === 'NO_OPENAI_KEY') {
      return res.status(503).json({ error: e.message, code: 'NO_OPENAI_KEY' });
    }
    console.error('[checklists/ai] suggest-logic:', e);
    res.status(502).json({ error: e.message || 'Falha ao sugerir lógica.' });
  }
});

module.exports = router;
