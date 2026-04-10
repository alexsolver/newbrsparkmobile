'use strict';

/** Evita URL base com `/api/v1` duplicado. */
function normalizeComprefaceBaseUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    let p = (u.pathname || '').replace(/\/+$/, '');
    if (p === '/api/v1' || p.endsWith('/api/v1')) {
      p = p.slice(0, -7);
      p = p.replace(/\/+$/, '');
    }
    u.pathname = p || '';
    let out = u.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch {
    return s.replace(/\/+$/, '');
  }
}

function getComprefacePathPrefix(description) {
  const m = String(description || '').match(/path_prefix:\/?(\S+)/i);
  if (!m) return '';
  return m[1].replace(/^\/+|\/+$/g, '');
}

function joinComprefaceBasePrefix(base, prefixSegment) {
  const b = String(base || '').replace(/\/+$/, '');
  const seg = String(prefixSegment || '').replace(/^\/+|\/+$/g, '');
  if (!seg) return b;
  return `${b}/${seg}`;
}

function buildComprefaceApiRoots(baseUrl, description) {
  const n = normalizeComprefaceBaseUrl(baseUrl);
  const raw = String(baseUrl).trim().replace(/\/+$/, '');
  const bases = [];
  if (n) bases.push(n);
  if (raw && raw !== n) bases.push(raw);
  const prefix = getComprefacePathPrefix(description);
  const roots = [];
  for (const b of bases) {
    const withP = joinComprefaceBasePrefix(b, prefix);
    roots.push(withP);
    if (prefix && withP !== b) roots.push(b);
  }
  return [...new Set(roots)];
}

function comprefaceSubjectName(tenantId, userId) {
  return `${String(tenantId)}:${String(userId)}`;
}

/** @returns {{ tenantId: string, userId: string } | null} */
function parseComprefaceSubjectName(subject) {
  const s = String(subject || '').trim();
  const i = s.indexOf(':');
  if (i <= 0) return null;
  return { tenantId: s.slice(0, i), userId: s.slice(i + 1) };
}

function stripDataUrlBase64(b64) {
  const str = String(b64 || '').replace(/\s/g, '');
  const m = str.match(/^data:image\/\w+;base64,(.+)$/i);
  return m ? m[1] : str;
}

/**
 * @param {object} integration — registro Prisma Exadel CompreFace
 * @param {Buffer} imageBuffer
 * @param {{ predictionCount?: number }} opts
 */
async function recognizeWithIntegration(integration, imageBuffer, opts = {}) {
  const apiKey = integration.apiKey && String(integration.apiKey).trim();
  if (!apiKey) {
    const err = new Error('Recognition API Key não configurada.');
    err.code = 'MISSING_KEY';
    throw err;
  }
  const roots = buildComprefaceApiRoots(integration.baseUrl, integration.description);
  if (!roots.length) {
    const err = new Error('URL CompreFace não configurada.');
    err.code = 'MISSING_URL';
    throw err;
  }
  const predictionCount = Math.min(20, Math.max(1, Number(opts.predictionCount) || 5));
  const limit = 1;
  let lastErr;
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  for (const root of roots) {
    const base = String(root).replace(/\/+$/, '');
    const url = `${base}/api/v1/recognition/recognize?limit=${limit}&prediction_count=${predictionCount}`;
    const fd = new FormData();
    fd.append('file', blob, 'capture.jpg');
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: fd,
        signal: AbortSignal.timeout(45000),
        redirect: 'manual',
      });
      const text = await r.text().catch(() => '');
      if (r.ok) {
        try {
          return { root: base, data: JSON.parse(text) };
        } catch (e) {
          lastErr = new Error(`Resposta CompreFace inválida: ${e.message}`);
        }
      } else {
        lastErr = new Error(`CompreFace recognize HTTP ${r.status}: ${text.replace(/\s+/g, ' ').slice(0, 240)}`);
        lastErr.status = r.status;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Falha ao contatar o CompreFace.');
}

/**
 * Melhor previsão: primeiro rosto na imagem, melhor subject por similaridade.
 * @returns {{ subject: string, similarity: number } | null}
 */
function pickTopRecognitionMatch(recognizeJson) {
  const results = recognizeJson && Array.isArray(recognizeJson.result) ? recognizeJson.result : [];
  if (!results.length) return null;
  const face = results[0];
  const subjects = face && Array.isArray(face.subjects) ? face.subjects : [];
  if (!subjects.length) return null;
  const top = subjects[0];
  if (!top || top.subject == null || top.similarity == null) return null;
  const similarity = Number(top.similarity);
  if (!Number.isFinite(similarity)) return null;
  return { subject: String(top.subject), similarity };
}

async function comprefaceFetchJson(method, url, apiKey, { bodyJson, timeoutMs = 30000 } = {}) {
  const headers = { 'x-api-key': apiKey };
  let body;
  if (bodyJson !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(bodyJson);
  }
  const r = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'manual',
  });
  const text = await r.text().catch(() => '');
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { ok: r.ok, status: r.status, data, text };
}

async function ensureSubject(root, apiKey, subject) {
  const url = `${String(root).replace(/\/+$/, '')}/api/v1/recognition/subjects`;
  const { ok, status, data } = await comprefaceFetchJson('POST', url, apiKey, {
    bodyJson: { subject },
    timeoutMs: 20000,
  });
  if (ok) return { created: true, data };
  if (status === 400 || status === 409 || status === 422) return { created: false, data, status };
  const err = new Error(`CompreFace create subject HTTP ${status}`);
  err.status = status;
  err.data = data;
  throw err;
}

async function deleteFacesForSubject(root, apiKey, subject) {
  const base = String(root).replace(/\/+$/, '');
  const url = `${base}/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}`;
  const { ok, status, data } = await comprefaceFetchJson('DELETE', url, apiKey, { timeoutMs: 20000 });
  if (ok || status === 404) return { ok: true, data };
  const err = new Error(`CompreFace delete faces HTTP ${status}`);
  err.status = status;
  err.data = data;
  throw err;
}

/**
 * Lista nomes de subjects na app Recognition (CompreFace 0.6+).
 * @returns {Promise<string[]>}
 */
async function listRecognitionSubjects(root, apiKey) {
  const base = String(root).replace(/\/+$/, '');
  const urls = [`${base}/api/v1/recognition/subjects`, `${base}/api/v1/recognition/subjects/`];
  let lastErr;
  for (const url of urls) {
    const { ok, status, data } = await comprefaceFetchJson('GET', url, apiKey, { timeoutMs: 45000 });
    if (ok) {
      const d = data && typeof data === 'object' ? data : {};
      let list = d.subjects;
      if (!Array.isArray(list) && Array.isArray(d.content)) list = d.content;
      if (!Array.isArray(list) && Array.isArray(d._embedded?.subjects)) list = d._embedded.subjects;
      if (!Array.isArray(list)) list = [];
      return list
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') return item.subject ?? item.name ?? '';
          return String(item);
        })
        .filter(Boolean);
    }
    lastErr = new Error(`CompreFace list subjects HTTP ${status}`);
  }
  throw lastErr || new Error('CompreFace list subjects failed');
}

/**
 * Remove faces de subjects BrSpark `tenantId:userId` quando o userId coincide com o usuário
 * mas o tenantId é diferente do atual (ex.: mudança de tenant / dados antigos no CompreFace).
 * Não remove o subject atual nem subjects sem formato BrSpark.
 * @returns {Promise<{ cleaned: number }>}
 */
async function deleteStaleBrsparkSubjectFacesForUser(root, apiKey, currentTenantId, userId) {
  const uid = String(userId || '').trim();
  const tid = String(currentTenantId || '').trim();
  if (!uid || !tid) return { cleaned: 0 };

  let names = [];
  try {
    names = await listRecognitionSubjects(root, apiKey);
  } catch (e) {
    console.warn('[comprefaceClient] list recognition subjects failed; orphan cleanup skipped:', e.message || e);
    return { cleaned: 0 };
  }

  let cleaned = 0;
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const parsed = parseComprefaceSubjectName(name);
    if (!parsed) continue;
    if (String(parsed.userId) !== uid) continue;
    if (String(parsed.tenantId) === tid) continue;
    try {
      await deleteFacesForSubject(root, apiKey, name);
      cleaned += 1;
      console.info('[comprefaceClient] removed CompreFace faces from stale subject:', name);
    } catch (e) {
      console.warn('[comprefaceClient] failed to delete stale subject faces:', name, e.message || e);
    }
  }
  return { cleaned };
}

async function addFaceToSubject(root, apiKey, subject, imageBuffer, filename = 'enroll.jpg') {
  const base = String(root).replace(/\/+$/, '');
  const url = `${base}/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}`;
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  const fd = new FormData();
  fd.append('file', blob, filename);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: fd,
    signal: AbortSignal.timeout(60000),
    redirect: 'manual',
  });
  const text = await r.text().catch(() => '');
  if (!r.ok) {
    const err = new Error(`CompreFace add face HTTP ${r.status}: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

module.exports = {
  normalizeComprefaceBaseUrl,
  buildComprefaceApiRoots,
  getComprefacePathPrefix,
  comprefaceSubjectName,
  parseComprefaceSubjectName,
  stripDataUrlBase64,
  recognizeWithIntegration,
  pickTopRecognitionMatch,
  ensureSubject,
  deleteFacesForSubject,
  listRecognitionSubjects,
  deleteStaleBrsparkSubjectFacesForUser,
  addFaceToSubject,
};
