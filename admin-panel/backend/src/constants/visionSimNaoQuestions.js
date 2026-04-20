'use strict';

/**
 * Máximo de itens no array `questions` enviado à API (Visão de IA — análise / Gemini).
 * Manter alinhado com o app e `checklists-builder.js`.
 */
const MAX_VISION_SIMNAO_QUESTIONS = 10;

/** Visão de IA — detecção (Moondream VQA ou proxy YOLO): apenas um critério por envio de mídia. */
const MAX_VISION_CHECKLIST_QUESTIONS = 1;

/** Tamanho máximo do texto do único prompt estruturado (`visionStructuredPrompt` / `q1`). */
const MAX_VISION_STRUCTURED_PROMPT_CHARS = 12000;

/** Com mais de uma pergunta sim/não, limite por pergunta (YOLO / endpoint comum). */
const MAX_VISION_MULTI_SIMNAO_TEXT_CHARS = 500;

module.exports = {
  MAX_VISION_SIMNAO_QUESTIONS,
  MAX_VISION_CHECKLIST_QUESTIONS,
  MAX_VISION_STRUCTURED_PROMPT_CHARS,
  MAX_VISION_MULTI_SIMNAO_TEXT_CHARS,
};
