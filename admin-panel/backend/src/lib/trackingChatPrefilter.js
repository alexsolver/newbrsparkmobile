'use strict';

/**
 * Normaliza para comparação (remove acentos).
 * @param {string} s
 */
function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Lista curta de insultos comuns (pt); expandir conforme política interna. */
const OFFENSIVE_STEMS = [
  'idiota',
  'imbecil',
  'estupido',
  'burro',
  'animal',
  'lixo',
  'morre',
  'matar',
  'se foder',
  'fdp',
  'vtnc',
  'cacete',
];

const CONTACT_PATTERNS = [
  /\bwhatsapp\b/i,
  /\bwa\.me\b/i,
  /\btelegram\.me\b/i,
  /\b(t\.me|telegram)\b/i,
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
  /\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-.\s]?\d{4}\b/,
];

const REPEAT_CHAR = /(.)\1{11,}/;

/**
 * @param {string} text
 * @param {{ recentClient?: number[], recentTech?: number[] }} [rateHint] timestamps ms for flood
 */
function runTrackingChatPrefilter(text, rateHint) {
  const raw = String(text || '');
  const folded = fold(raw);
  const flags = /** @type {string[]} */ ([]);
  let spamScore = 0;
  let contactPatternsHit = 0;

  if (REPEAT_CHAR.test(raw)) {
    flags.push('spam');
    spamScore += 0.4;
  }

  for (const re of CONTACT_PATTERNS) {
    if (re.test(raw)) {
      contactPatternsHit += 1;
      flags.push('contact_solicitation');
      break;
    }
  }

  for (const w of OFFENSIVE_STEMS) {
    if (folded.includes(fold(w))) {
      flags.push('offensive');
      break;
    }
  }

  const letters = raw.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (letters.length > 24) {
    const up = letters.replace(/[^A-ZÁ-Ý]/g, '').length;
    if (up / letters.length > 0.72) {
      flags.push('offensive');
      spamScore += 0.15;
    }
  }

  if (rateHint) {
    const now = Date.now();
    const win = 60_000;
    const maxInWindow = 12;
    const arr = [...(rateHint.recentClient || []), ...(rateHint.recentTech || [])];
    const n = arr.filter((t) => now - t < win).length;
    if (n >= maxInWindow) {
      flags.push('spam');
      spamScore += 0.6;
    }
  }

  const uniq = [...new Set(flags)];
  let suggestedCategory = null;
  if (uniq.includes('contact_solicitation')) suggestedCategory = 'contact_solicitation';
  else if (uniq.includes('spam')) suggestedCategory = 'spam';
  else if (uniq.includes('offensive')) suggestedCategory = 'offensive';

  let suggestedSeverity = 'low';
  if (spamScore >= 0.5 || uniq.includes('contact_solicitation')) suggestedSeverity = 'medium';
  if (spamScore >= 0.85) suggestedSeverity = 'high';

  return {
    flags: uniq,
    spamScore,
    contactPatternsHit,
    suggestedCategory: suggestedCategory || (uniq[0] ? uniq[0] : null),
    suggestedSeverity,
    /** confiança heurística 0–1 do pré-filtro */
    confidence: uniq.length ? Math.min(0.95, 0.45 + spamScore * 0.5 + (uniq.includes('contact_solicitation') ? 0.25 : 0)) : 0,
  };
}

module.exports = {
  runTrackingChatPrefilter,
  fold,
};
