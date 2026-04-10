'use strict';

/**
 * Chat Completions: `message.content` pode ser string ou array de partes.
 * @param {unknown} content
 * @returns {string}
 */
function openAiMessageContentToString(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          if (typeof p.text === 'string') return p.text;
          if (p.type === 'text' && typeof p.text === 'string') return p.text;
        }
        return '';
      })
      .join('');
  }
  return String(content);
}

/**
 * JSON devolvido pelo modelo (markdown ```json``` ou texto extra).
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function parseOpenAiJsonObject(raw) {
  const t = String(raw || '').trim();
  try {
    const o = JSON.parse(t);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
  } catch {
    /* continuar */
  }
  const fence = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (fence) {
    try {
      const inner = fence[1].trim();
      const o = JSON.parse(inner);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch {
      /* continuar */
    }
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(t.slice(start, end + 1));
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch {
      /* continuar */
    }
  }
  throw new SyntaxError('JSON object esperado na resposta do modelo');
}

module.exports = {
  openAiMessageContentToString,
  parseOpenAiJsonObject,
};
