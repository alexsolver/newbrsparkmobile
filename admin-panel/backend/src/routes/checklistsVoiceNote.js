'use strict';

const express = require('express');
const multer = require('multer');
const authUser = require('../middleware/authUser');
const { transcribeAudioWithOpenAiWhisper } = require('../lib/openAiWhisperTranscribe');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 24 * 1024 * 1024 },
});

const ALLOWED_MIME = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/x-caf',
  'video/mp4',
]);

function normalizeMime(mt) {
  const m = String(mt || '').toLowerCase().split(';')[0].trim();
  if (ALLOWED_MIME.has(m)) return m;
  if (m.startsWith('audio/')) return m;
  return '';
}

/**
 * POST /api/checklists/voice/transcribe
 * multipart: campo "audio" (arquivo). Opcional: language (pt, en, …).
 * JWT técnico (authUser).
 */
router.post('/voice/transcribe', authUser, upload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'Envie o áudio no campo «audio».' });
    }
    const mime = normalizeMime(file.mimetype);
    if (!mime || (!mime.startsWith('audio/') && mime !== 'video/mp4')) {
      return res.status(400).json({
        error: `Tipo de áudio não suportado (${String(file.mimetype || '—')}). Use m4a, mp3, wav, webm ou ogg.`,
      });
    }
    const language = req.body && req.body.language != null ? String(req.body.language).trim() : 'pt';
    const out = await transcribeAudioWithOpenAiWhisper({
      buffer: file.buffer,
      mimetype: mime,
      filename: file.originalname || 'recording.m4a',
      language: language || undefined,
    });
    if (!out.ok) {
      const st = out.status === 401 ? 401 : out.status && out.status >= 400 && out.status < 600 ? out.status : 502;
      return res.status(st).json({ error: out.error });
    }
    res.json({ transcript: out.text });
  } catch (err) {
    console.error('[checklists/voice/transcribe]', err);
    res.status(500).json({ error: err.message || 'Falha na transcrição.' });
  }
});

module.exports = router;
