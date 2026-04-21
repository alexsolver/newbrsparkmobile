'use strict';

const https = require('https');
const { URL } = require('url');
const { resolveOpenAiCredentials } = require('./openAiCredentials');

/**
 * @param {string} boundary
 * @param {{ name: string, value?: string, filename?: string, contentType?: string, buffer?: Buffer }[]} parts
 * @returns {Buffer}
 */
function buildMultipartBody(boundary, parts) {
  const chunks = [];
  const b = `--${boundary}`;
  for (const p of parts) {
    chunks.push(Buffer.from(`${b}\r\n`, 'utf8'));
    if (p.buffer && p.filename) {
      const fn = String(p.filename).replace(/"/g, '');
      const ct = String(p.contentType || 'application/octet-stream').replace(/\r|\n/g, '');
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${p.name}"; filename="${fn}"\r\nContent-Type: ${ct}\r\n\r\n`,
          'utf8',
        ),
      );
      chunks.push(p.buffer);
      chunks.push(Buffer.from('\r\n', 'utf8'));
    } else {
      const v = p.value != null ? String(p.value) : '';
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${v}\r\n`, 'utf8'));
    }
  }
  chunks.push(Buffer.from(`${b}--\r\n`, 'utf8'));
  return Buffer.concat(chunks);
}

/**
 * @param {string} baseUrl ex. https://api.openai.com/v1
 * @returns {{ hostname: string, port: number, path: string, protocol: string }}
 */
function openAiAudioTranscriptionTarget(baseUrl) {
  const raw = String(baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  const pathBase = (u.pathname || '').replace(/\/+$/, '') || '/v1';
  const path = `${pathBase}/audio/transcriptions`;
  const port = u.port ? parseInt(u.port, 10) : u.protocol === 'http:' ? 80 : 443;
  return { hostname: u.hostname, port, path, protocol: u.protocol || 'https:' };
}

/**
 * Transcreve áudio via OpenAI Whisper (mesma API key da integração OpenAI).
 *
 * @param {{ buffer: Buffer, mimetype: string, filename?: string, language?: string }} opts
 * @returns {Promise<{ ok: true, text: string } | { ok: false, error: string, status?: number }>}
 */
async function transcribeAudioWithOpenAiWhisper(opts) {
  const { buffer, mimetype, filename, language } = opts || {};
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, error: 'Áudio vazio.' };
  }
  const maxBytes = 24 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return { ok: false, error: 'Áudio muito grande (máx. 24 MB para transcrição).' };
  }

  const cred = await resolveOpenAiCredentials();
  if (!cred.apiKey) {
    return {
      ok: false,
      error:
        'Chave OpenAI ausente: configure a integração «OpenAI» em Integrações no painel ou OPENAI_API_KEY no servidor.',
    };
  }

  const boundary = `brspark_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const ext = (() => {
    const fn = String(filename || 'recording.m4a').toLowerCase();
    const m = String(mimetype || '').toLowerCase();
    if (fn.endsWith('.wav')) return { name: 'audio.wav', ct: 'audio/wav' };
    if (fn.endsWith('.webm')) return { name: 'audio.webm', ct: 'audio/webm' };
    if (fn.endsWith('.mp3')) return { name: 'audio.mp3', ct: 'audio/mpeg' };
    if (fn.endsWith('.mp4') || fn.endsWith('.m4a')) return { name: 'audio.m4a', ct: m.includes('mp4') ? 'audio/mp4' : 'audio/m4a' };
    if (m.includes('wav')) return { name: 'audio.wav', ct: 'audio/wav' };
    if (m.includes('webm')) return { name: 'audio.webm', ct: 'audio/webm' };
    if (m.includes('mpeg') || m.includes('mp3')) return { name: 'audio.mp3', ct: 'audio/mpeg' };
    return { name: 'audio.m4a', ct: m.includes('video') ? 'audio/mp4' : m || 'audio/m4a' };
  })();

  const parts = [
    { name: 'model', value: 'whisper-1' },
    { name: 'response_format', value: 'json' },
    {
      name: 'file',
      filename: ext.name,
      contentType: ext.ct,
      buffer,
    },
  ];
  let lang = String(language || '').trim().toLowerCase().replace(/_/g, '-').slice(0, 8);
  // Whisper (ISO 639-1): pt-br / pt_pt → pt; demais mantidos se casarem o padrão
  if (lang.startsWith('pt')) lang = 'pt';
  if (lang && /^[a-z]{2}(-[a-z]{2,4})?$/i.test(lang)) {
    parts.splice(1, 0, { name: 'language', value: lang });
  }

  const body = buildMultipartBody(boundary, parts);
  const { hostname, port, path, protocol } = openAiAudioTranscriptionTarget(cred.baseUrl);
  const useTls = protocol !== 'http:';

  /** @type {{ status: number, body: string }} */
  const result = await new Promise((resolve, reject) => {
    const mod = useTls ? https : require('http');
    const req = mod.request(
      {
        hostname,
        port,
        path,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cred.apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (d) => {
          data += d;
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (result.status !== 200) {
    let hint = result.body ? result.body.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
    try {
      const j = JSON.parse(result.body);
      if (j?.error?.message) hint = String(j.error.message);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      status: result.status,
      error:
        result.status === 401
          ? 'OpenAI recusou a chave (401). Verifique a integração «OpenAI».'
          : `Transcrição OpenAI falhou (HTTP ${result.status}).${hint ? ` ${hint}` : ''}`,
    };
  }

  try {
    const j = JSON.parse(result.body);
    const text = typeof j.text === 'string' ? j.text.trim() : '';
    if (!text) {
      return { ok: false, error: 'A API não devolveu texto de transcrição.' };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, error: 'Resposta da transcrição não é JSON válido.' };
  }
}

module.exports = {
  transcribeAudioWithOpenAiWhisper,
};
