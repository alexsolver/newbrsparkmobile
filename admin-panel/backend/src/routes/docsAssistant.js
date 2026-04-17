'use strict';

const express = require('express');
const { adminAuthThenPanel } = require('../middleware/auth');
const { askDocsAssistant } = require('../lib/docsAssistant');

const router = express.Router();

/**
 * POST /api/docs/assistant
 * Body: { messages: [{ role: 'user'|'assistant', content: string }] }
 */
router.post('/assistant', adminAuthThenPanel, async (req, res) => {
  try {
    const out = await askDocsAssistant({
      messages: req.body?.messages,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e.code === 'BAD_REQUEST') {
      return res.status(400).json({ error: e.message });
    }
    if (e.code === 'NO_OPENAI_KEY') {
      return res.status(503).json({ error: e.message, code: 'NO_OPENAI_KEY' });
    }
    console.error('[docs/assistant]:', e);
    return res.status(502).json({ error: e.message || 'Falha no assistente técnico.' });
  }
});

module.exports = router;
