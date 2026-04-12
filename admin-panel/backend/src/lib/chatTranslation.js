'use strict';

const { resolveOpenAiCredentials } = require('./openAiCredentials');
const { openAiMessageContentToString } = require('./openAiChatParse');

const CANON = ['pt-BR', 'en-US', 'es-ES'];

function chatTranslationEnabled() {
  return String(process.env.CHAT_TRANSLATION_ENABLED || '1').trim() !== '0';
}

/**
 * Normaliza para um dos locales canónicos usados no cache.
 * @param {string|null|undefined} raw
 * @returns {string}
 */
function normalizeChatLocale(raw) {
  const s = String(raw || '').trim().replace(/_/g, '-');
  if (!s) return 'pt-BR';
  const lower = s.toLowerCase();
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en-US';
  if (lower === 'es' || lower.startsWith('es-')) return 'es-ES';
  if (CANON.includes(s)) return s;
  return 'pt-BR';
}

/**
 * @param {string} text
 * @param {string} targetLocale canónico (pt-BR, en-US, es-ES)
 * @returns {Promise<string|null>} null se desativado, sem chave, ou falha
 */
async function translateChatText(text, targetLocale) {
  if (!chatTranslationEnabled()) return null;
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const target = normalizeChatLocale(targetLocale);

  let creds;
  try {
    creds = await resolveOpenAiCredentials();
  } catch (e) {
    console.warn('[chatTranslation] creds:', e.message);
    return null;
  }
  const { apiKey, model, baseUrl } = creds;
  if (!apiKey || !String(apiKey).trim()) return null;

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              `You translate short mobile chat messages into ${target} (BCP-47). ` +
              'Preserve meaning, tone, URLs, @mentions, and line breaks. ' +
              'If the text is already in that language, return it unchanged. ' +
              'Output ONLY the translated message text, with no quotes or preamble.',
          },
          { role: 'user', content: trimmed },
        ],
      }),
    });
    if (!res.ok) {
      console.warn('[chatTranslation] HTTP', res.status);
      return null;
    }
    const data = await res.json();
    const out = openAiMessageContentToString(data?.choices?.[0]?.message?.content);
    const s = String(out || '').trim();
    return s.length ? s : null;
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.warn('[chatTranslation]', e.message);
    }
    return null;
  } finally {
    clearTimeout(tid);
  }
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function parseTranslationsJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    /** @type {Record<string, string>} */
    const o = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.trim()) o[k] = v.trim();
    }
    return o;
  }
  return {};
}

module.exports = {
  chatTranslationEnabled,
  normalizeChatLocale,
  translateChatText,
  parseTranslationsJson,
  CANON_LOCALES: CANON,
};
