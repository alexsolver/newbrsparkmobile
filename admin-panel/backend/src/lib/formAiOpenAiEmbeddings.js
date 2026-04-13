'use strict';

const { resolveOpenAiCredentials } = require('./openAiCredentials');

/**
 * Gera vetor de embedding via OpenAI `/v1/embeddings`.
 * @param {string} inputText
 * @returns {Promise<{ vector: number[], model: string }>}
 */
async function createEmbeddingVector(inputText) {
  const text = String(inputText || '').trim().slice(0, 8000);
  if (!text) {
    const err = new Error('Texto vazio para embedding.');
    err.code = 'EMBED_EMPTY';
    throw err;
  }

  const { apiKey, baseUrl, embeddingModel } = await resolveOpenAiCredentials();
  if (!apiKey || !String(apiKey).trim()) {
    const err = new Error(
      'Chave OpenAI em falta: configure a integração "OpenAI" em Integrações no painel, ou defina OPENAI_API_KEY no servidor.'
    );
    err.code = 'NO_OPENAI_KEY';
    throw err;
  }

  const model = embeddingModel || 'text-embedding-3-small';
  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/embeddings`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${String(apiKey).trim()}`,
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  });

  const rawText = await res.text();
  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Resposta OpenAI embeddings inválida (HTTP ${res.status}): ${rawText.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = data?.error?.message || rawText.slice(0, 300);
    throw new Error(`OpenAI embeddings: ${msg}`);
  }

  const emb = data?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || !emb.length) {
    throw new Error('OpenAI embeddings: resposta sem vetor.');
  }
  const vector = emb.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (vector.length !== emb.length) {
    throw new Error('OpenAI embeddings: vetor com valores não numéricos.');
  }

  return { vector, model };
}

/**
 * Similaridade coseno entre dois vetores da mesma dimensão.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

/**
 * @param {unknown} raw
 * @returns {number[] | null}
 */
function jsonToVector(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out.length ? out : null;
}

module.exports = {
  createEmbeddingVector,
  cosineSimilarity,
  jsonToVector,
};
