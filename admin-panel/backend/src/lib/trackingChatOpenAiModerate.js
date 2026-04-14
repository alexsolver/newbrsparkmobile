'use strict';

const https = require('https');
const { resolveOpenAiCredentials } = require('./openAiCredentials');

/**
 * Chama OpenAI /v1/moderations (modelo omni-moderation-latest ou default da API).
 * @param {string} text
 * @param {number} timeoutMs
 * @returns {Promise<{ flagged: boolean, categories: Record<string, boolean>, category_scores: Record<string, number>, raw?: unknown, error?: string }>}
 */
async function openAiModerateText(text, timeoutMs) {
  const input = String(text || '').slice(0, 8000);
  const cred = await resolveOpenAiCredentials();
  if (!cred.apiKey) {
    return { flagged: false, categories: {}, category_scores: {}, error: 'no_api_key' };
  }

  let apiUrl;
  try {
    const b = String(cred.baseUrl || 'https://api.openai.com/v1').trim();
    apiUrl = new URL(b.startsWith('http') ? b : `https://${b}`);
  } catch {
    apiUrl = new URL('https://api.openai.com/v1');
  }
  const modPath = `${apiUrl.pathname.replace(/\/$/, '')}/moderations`;

  const body = JSON.stringify({ input });

  const result = await new Promise((resolve) => {
    const opts = {
      hostname: apiUrl.hostname,
      path: modPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cred.apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, data });
      });
    });
    req.on('error', (e) => resolve({ status: 0, data: '', err: e.message }));
    const t = setTimeout(() => {
      req.destroy();
      resolve({ status: 0, data: '', err: 'timeout' });
    }, timeoutMs);
    req.write(body);
    req.end();
    req.on('close', () => clearTimeout(t));
  });

  if (result.err === 'timeout' || result.status === 0) {
    return { flagged: false, categories: {}, category_scores: {}, error: 'timeout' };
  }
  try {
    const json = JSON.parse(result.data);
    const r0 = json && Array.isArray(json.results) ? json.results[0] : null;
    if (!r0) {
      return { flagged: false, categories: {}, category_scores: {}, error: 'bad_response', raw: json };
    }
    return {
      flagged: !!r0.flagged,
      categories: r0.categories || {},
      category_scores: r0.category_scores || {},
      raw: { model: json.model, id: json.id },
    };
  } catch (e) {
    return { flagged: false, categories: {}, category_scores: {}, error: 'parse', raw: result.data };
  }
}

/**
 * Mapeia scores OpenAI → categoria interna dominante + severidade + confiança.
 * @param {Record<string, number>} scores
 */
function mapOpenAiScoresToInternal(scores) {
  const s = scores && typeof scores === 'object' ? scores : {};
  const entries = Object.entries(s).filter(([, v]) => typeof v === 'number');
  if (!entries.length) {
    return { category: null, severity: /** @type {'low'} */ ('low'), confidence: 0 };
  }
  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topVal] = entries[0];

  let category = 'offensive';
  if (topKey === 'sexual' || topKey === 'sexual/minors') category = 'sexual';
  else if (topKey === 'hate' || topKey === 'hate/threatening') category = 'discrimination';
  else if (topKey === 'harassment' || topKey === 'harassment/threatening') category = 'harassment';
  else if (topKey === 'violence' || topKey === 'violence/graphic') category = 'threat';
  else if (topKey === 'self-harm') category = 'threat';
  else if (topKey === 'illicit' || topKey === 'illicit/violent') category = 'threat';

  let severity = 'low';
  if (topVal >= 0.85) severity = 'high';
  else if (topVal >= 0.35) severity = 'medium';

  return { category, severity, confidence: Math.min(0.99, topVal) };
}

module.exports = {
  openAiModerateText,
  mapOpenAiScoresToInternal,
};
