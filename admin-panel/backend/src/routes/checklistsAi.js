'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const { adminAuth } = require('../middleware/auth');
const { extractWorkbookForAi } = require('../lib/formAiExtract');
const {
  normalizeProposalsFromLlm,
  buildSchemaFromProposalSelections,
  sanitizeTemplateText,
} = require('../lib/formAiNormalize');
const { generateSchemaFromCanonical, analyzeSpreadsheetStructure } = require('../lib/formAiLlm');
const { runFormCopilot, suggestLogicRules } = require('../lib/formAiCopilot');
const { parseFormContextFromOptions } = require('../lib/formAiContext');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
});

/**
 * POST /api/checklists/ai/analyze-from-file
 * multipart: file (.xlsx), optional field "options" JSON string { hint?: string }
 * Resposta: title, description, blocks (estrutura: section_break | field), warnings, truncated, source
 */
router.post('/ai/analyze-from-file', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Envie um arquivo no campo "file".' });
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xlsm') {
      return res.status(400).json({
        error: 'Formato não suportado nesta versão. Use arquivo Excel .xlsx (MVP).',
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
      snapshot = await extractWorkbookForAi(file.buffer);
    } catch (e) {
      console.error('[checklists/ai] extract xlsx:', e);
      return res.status(400).json({ error: 'Não foi possível ler o Excel: ' + e.message });
    }

    if (!snapshot.markdown || snapshot.markdown.length < 3) {
      return res.status(400).json({ error: 'A planilha parece vazia.' });
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
      });
    } catch (e) {
      if (e.code === 'NO_OPENAI_KEY') {
        return res.status(503).json({
          error: e.message,
          code: 'NO_OPENAI_KEY',
        });
      }
      console.error('[checklists/ai] analyze llm:', e);
      return res.status(502).json({ error: 'Falha ao analisar planilha com IA: ' + e.message });
    }

    const truncWarn = snapshot.truncated ? ['Conteúdo truncado por limite de tamanho.'] : [];
    res.json({
      ok: true,
      title: analyzed.title,
      description: analyzed.description,
      blocks: analyzed.blocks,
      warnings: [...(analyzed.warnings || []), ...truncWarn],
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
router.post('/ai/build-form', adminAuth, async (req, res) => {
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
 * multipart: file (.xlsx), optional field "options" JSON string { hint?: string }
 */
router.post('/ai/draft-from-file', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Envie um arquivo no campo "file".' });
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xlsm') {
      return res.status(400).json({
        error: 'Formato não suportado nesta versão. Use arquivo Excel .xlsx (MVP).',
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
      snapshot = await extractWorkbookForAi(file.buffer);
    } catch (e) {
      console.error('[checklists/ai] extract xlsx:', e);
      return res.status(400).json({ error: 'Não foi possível ler o Excel: ' + e.message });
    }

    if (!snapshot.markdown || snapshot.markdown.length < 3) {
      return res.status(400).json({ error: 'A planilha parece vazia.' });
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

    res.json({
      ok: true,
      title: generated.title,
      description: generated.description,
      schemaData: generated.schemaData,
      warnings: [...(generated.warnings || []), ...(snapshot.truncated ? ['Conteúdo truncado por limite de tamanho.'] : [])],
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
 * JSON: { messages: [{role, content}], schemaData?: [], formContext?: {}, spreadsheetSummary?: string }
 */
router.post('/ai/session/chat', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Envie "messages" (array não vazio).' });
    }
    const schemaData = Array.isArray(body.schemaData) ? body.schemaData : [];
    const formContext = parseFormContextFromOptions(body.formContext || {});
    const spreadsheetSummary =
      typeof body.spreadsheetSummary === 'string' ? body.spreadsheetSummary : '';

    const out = await runFormCopilot({
      messages,
      schemaData,
      formContext,
      spreadsheetSummary,
    });
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e.code === 'NO_OPENAI_KEY') {
      return res.status(503).json({ error: e.message, code: 'NO_OPENAI_KEY' });
    }
    console.error('[checklists/ai] session/chat:', e);
    res.status(502).json({ error: e.message || 'Falha no copiloto IA.' });
  }
});

/**
 * POST /api/checklists/ai/suggest-logic
 * JSON: { schemaData: [], userGoal: string, formContext?: {} }
 */
router.post('/ai/suggest-logic', adminAuth, async (req, res) => {
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
    const out = await suggestLogicRules(body.schemaData, userGoal, formContext);
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e.code === 'NO_OPENAI_KEY') {
      return res.status(503).json({ error: e.message, code: 'NO_OPENAI_KEY' });
    }
    console.error('[checklists/ai] suggest-logic:', e);
    res.status(502).json({ error: e.message || 'Falha ao sugerir lógica.' });
  }
});

module.exports = router;
