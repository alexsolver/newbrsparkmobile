'use strict';

/** Lista mínima PT — expandir conforme política do tenant. */
const BANNED = [
  /\b(caralho|merda|puta|fdp|filho da puta|cu\b|porra)\b/gi,
];

/**
 * @param {string|null|undefined} raw
 * @returns {{ displayText: string|null, rawClientText: string|null, moderationMeta: object }}
 */
function moderateClientComment(raw) {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) {
    return { displayText: null, rawClientText: null, moderationMeta: { empty: true } };
  }

  let flagged = false;
  let masked = s;
  for (const re of BANNED) {
    if (re.test(s)) {
      flagged = true;
      masked = masked.replace(re, '***');
    }
  }

  if (flagged) {
    return {
      displayText:
        'Parte do comentário foi ocultada por linguagem inadequada. O registro completo permanece para revisão interna.',
      rawClientText: s,
      moderationMeta: { flagged: true, strategy: 'mask_list_v1' },
    };
  }

  return {
    displayText: s,
    rawClientText: s,
    moderationMeta: { flagged: false },
  };
}

module.exports = { moderateClientComment };
