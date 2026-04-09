'use strict';

const prisma = require('../db');

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE = 'https://api.openai.com/v1';

function looksLikeHttpUrl(s) {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim().toLowerCase();
  return t.startsWith('http://') || t.startsWith('https://');
}

/** Garante sufixo /v1 para chamadas chat/completions. */
function normalizeOpenAiV1Base(url) {
  let u = String(url || DEFAULT_BASE).trim().replace(/\/+$/, '');
  if (!/\/v1$/i.test(u)) {
    u = `${u}/v1`;
  }
  return u;
}

/**
 * API key: integração "OpenAI" (AI_LLM) na BD; senão OPENAI_API_KEY no .env.
 * Modelo: metadata.model > baseUrl (quando não é URL — o painel grava o modelo aqui) > OPENAI_MODEL > gpt-4o-mini.
 * Base URL da API: baseUrl se for URL; senão OPENAI_BASE_URL ou api.openai.com.
 *
 * @returns {Promise<{ apiKey: string, model: string, baseUrl: string, source: 'integration'|'env'|'none' }>}
 */
async function resolveOpenAiCredentials() {
  const envKey = (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim()) || '';
  const envModel = (process.env.OPENAI_MODEL && String(process.env.OPENAI_MODEL).trim()) || '';
  const envBaseRaw = (process.env.OPENAI_BASE_URL && String(process.env.OPENAI_BASE_URL).trim()) || '';

  let row = null;
  try {
    row = await prisma.integration.findFirst({
      where: { name: 'OpenAI', type: 'AI_LLM' },
      orderBy: { updatedAt: 'desc' },
    });
  } catch (e) {
    console.warn('[openAiCredentials] prisma:', e.message);
  }

  const intKey = row && row.apiKey ? String(row.apiKey).trim() : '';
  const apiKey = intKey || envKey;

  let baseUrl = normalizeOpenAiV1Base(envBaseRaw || DEFAULT_BASE);
  let model = envModel || DEFAULT_MODEL;

  if (row) {
    const bu = String(row.baseUrl || '').trim();
    if (looksLikeHttpUrl(bu)) {
      baseUrl = normalizeOpenAiV1Base(bu);
    } else if (bu) {
      model = bu;
    }
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : null;
    if (meta && typeof meta.model === 'string' && meta.model.trim()) {
      model = meta.model.trim();
    }
  }

  const source = intKey ? 'integration' : envKey ? 'env' : 'none';

  return { apiKey, model: model || DEFAULT_MODEL, baseUrl, source };
}

module.exports = {
  resolveOpenAiCredentials,
  normalizeOpenAiV1Base,
  DEFAULT_MODEL,
};
