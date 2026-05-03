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

function envVerificationSingleDirection() {
  const v = String(process.env.COMPREFACE_VERIFICATION_SINGLE_DIRECTION || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function envVerificationTimeoutMs() {
  const n = Number(process.env.COMPREFACE_VERIFICATION_TIMEOUT_MS);
  return Math.min(120000, Math.max(15000, Number.isFinite(n) && n > 0 ? n : 60000));
}

/**
 * @param {object} integration — registro Prisma Exadel FaceMatch
 * @param {Buffer} imageBuffer
 * @param {{ predictionCount?: number, timeoutMs?: number }} opts — `timeoutMs` omisso: 45000.
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
    const err = new Error('URL FaceMatch não configurada.');
    err.code = 'MISSING_URL';
    throw err;
  }
  const predictionCount = Math.min(20, Math.max(1, Number(opts.predictionCount) || 5));
  const timeoutMs = Math.min(120000, Math.max(3000, Number(opts.timeoutMs) || 45000));
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
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });
      const text = await r.text().catch(() => '');
      if (r.ok) {
        try {
          return { root: base, data: JSON.parse(text) };
        } catch (e) {
          lastErr = new Error(`Resposta FaceMatch inválida: ${e.message}`);
        }
      } else {
        let parsedBody = null;
        try {
          parsedBody = text ? JSON.parse(text) : null;
        } catch {
          parsedBody = null;
        }
        lastErr = new Error(`FaceMatch recognize HTTP ${r.status}: ${text.replace(/\s+/g, ' ').slice(0, 240)}`);
        lastErr.status = r.status;
        if (parsedBody && typeof parsedBody === 'object') {
          if (parsedBody.code != null) lastErr.comprefaceCode = parsedBody.code;
          if (parsedBody.message != null) lastErr.comprefaceMessage = String(parsedBody.message);
        }
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Falha ao contatar o FaceMatch.');
}

/**
 * Melhor previsão: primeiro rosto na imagem, melhor subject por similaridade.
 * @returns {{ subject: string, similarity: number } | null}
 */
/** HTTP 400 código 28 — «No face is found in the given image» (imagem sem rosto detetável). */
function isFaceMatchNoFaceInImageError(err) {
  if (!err) return false;
  const st = Number(err.status);
  if (st !== 400) return false;
  const c = err.comprefaceCode;
  if (c === 28 || c === '28' || Number(c) === 28) return true;
  const sub = String(err.comprefaceMessage || '');
  if (/no face is found/i.test(sub)) return true;
  const msg = String(err.message || '');
  if (/no face is found/i.test(msg)) return true;
  return /"code"\s*:\s*28\b/.test(msg);
}

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

/**
 * Candidatos únicos do Recognition sobre **todos** os rostos da imagem, ordenados por similaridade
 * (maior primeiro). O CompreFace ordena rostos por tamanho; em fotos de grupo o rosto alvo pode não ser o primeiro.
 * @returns {Array<{ subject: string, similarity: number }>}
 */
function flattenRecognitionSubjectCandidates(recognizeJson) {
  const results = recognizeJson && Array.isArray(recognizeJson.result) ? recognizeJson.result : [];
  /** @type {Map<string, { subject: string, similarity: number }>} */
  const bestBySubject = new Map();
  for (const face of results) {
    const subjects = face && Array.isArray(face.subjects) ? face.subjects : [];
    for (const sub of subjects) {
      if (!sub || sub.subject == null || sub.similarity == null) continue;
      const similarity = Number(sub.similarity);
      if (!Number.isFinite(similarity)) continue;
      const key = String(sub.subject).trim();
      if (!key) continue;
      const prev = bestBySubject.get(key);
      if (!prev || similarity > prev.similarity) {
        bestBySubject.set(key, { subject: key, similarity });
      }
    }
  }
  return Array.from(bestBySubject.values()).sort((a, b) => b.similarity - a.similarity);
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
  const err = new Error(`FaceMatch create subject HTTP ${status}`);
  err.status = status;
  err.data = data;
  throw err;
}

async function deleteFacesForSubject(root, apiKey, subject) {
  const base = String(root).replace(/\/+$/, '');
  const url = `${base}/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}`;
  const { ok, status, data } = await comprefaceFetchJson('DELETE', url, apiKey, { timeoutMs: 20000 });
  if (ok || status === 404) return { ok: true, data };
  const err = new Error(`FaceMatch delete faces HTTP ${status}`);
  err.status = status;
  err.data = data;
  throw err;
}

/**
 * Lista nomes de subjects na app Recognition (FaceMatch 0.6+).
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
    lastErr = new Error(`FaceMatch list subjects HTTP ${status}`);
  }
  throw lastErr || new Error('FaceMatch list subjects failed');
}

/**
 * Remove faces de subjects BrSpark `tenantId:userId` quando o userId coincide com o usuário
 * mas o tenantId é diferente do atual (ex.: mudança de tenant / dados antigos no FaceMatch).
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
      console.info('[comprefaceClient] removed FaceMatch faces from stale subject:', name);
    } catch (e) {
      console.warn('[comprefaceClient] failed to delete stale subject faces:', name, e.message || e);
    }
  }
  return { cleaned };
}

function bufferToImageBlobPart(buf, role) {
  const b = buf && Buffer.isBuffer(buf) ? buf : Buffer.alloc(0);
  if (b.length < 12) {
    return { blob: new Blob([b], { type: 'image/jpeg' }), filename: `${role}.jpg` };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { blob: new Blob([b], { type: 'image/jpeg' }), filename: `${role}.jpg` };
  }
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { blob: new Blob([b], { type: 'image/png' }), filename: `${role}.png` };
  }
  const head = b.slice(0, 12);
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') {
    return { blob: new Blob([b], { type: 'image/webp' }), filename: `${role}.webp` };
  }
  return { blob: new Blob([b], { type: 'image/jpeg' }), filename: `${role}.jpg` };
}

/**
 * Melhor similaridade devolvida pelo Verification (percorre result[] e face_matches[]).
 * @returns {number} NaN se não houver matches
 */
function extractVerificationBestSimilarity(parsedJson) {
  const results = parsedJson && Array.isArray(parsedJson.result) ? parsedJson.result : [];
  let best = NaN;
  for (const block of results) {
    const matches = block && Array.isArray(block.face_matches) ? block.face_matches : [];
    for (const m of matches) {
      if (m && m.similarity != null) {
        const s = Number(m.similarity);
        if (Number.isFinite(s) && (!Number.isFinite(best) || s > best)) best = s;
      }
    }
  }
  return best;
}

/**
 * Compara duas imagens no serviço **Verification** do FaceMatch (não usa Recognition).
 * `source_image` = foto nova a validar; `target_image` = referência (foto de perfil).
 * Chama também na ordem inversa e usa o **mínimo** das duas similaridades (reduz falsos positivos).
 * Com `options.idDocumentPairing`, tenta as duas direções de forma independente e usa o **máximo** das que
 * funcionarem — fotos de RG/CNH falham muitas vezes numa direção (rosto pequeno no documento).
 * @param {{ idDocumentPairing?: boolean }} [options]
 * @returns {Promise<number>} similaridade 0..1 (conservadora ou, em modo documento, a melhor direção)
 */
async function verifyFacePairWithIntegration(
  integration,
  probeBuffer,
  referenceBuffer,
  verificationApiKey,
  options = {}
) {
  const idDocumentPairing = options && options.idDocumentPairing === true;
  const apiKey = String(verificationApiKey || '').trim();
  if (!apiKey) {
    const err = new Error('Verification API Key não configurada.');
    err.code = 'MISSING_VERIFICATION_KEY';
    throw err;
  }
  const roots = buildComprefaceApiRoots(integration.baseUrl, integration.description);
  if (!roots.length) {
    const err = new Error('URL FaceMatch não configurada.');
    err.code = 'MISSING_URL';
    throw err;
  }
  const probePart = bufferToImageBlobPart(probeBuffer, 'probe');
  const refPart = bufferToImageBlobPart(referenceBuffer, 'reference');

  const verifyTimeoutMs = envVerificationTimeoutMs();
  const singleDirection = envVerificationSingleDirection();

  async function postVerifyPair(blobSrc, nameSrc, blobTgt, nameTgt, base) {
    const url = `${base}/api/v1/verification/verify`;
    const fd = new FormData();
    fd.append('source_image', blobSrc, nameSrc);
    fd.append('target_image', blobTgt, nameTgt);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: fd,
      signal: AbortSignal.timeout(verifyTimeoutMs),
      redirect: 'manual',
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) {
      const err = new Error(`FaceMatch verification HTTP ${r.status}: ${text.replace(/\s+/g, ' ').slice(0, 240)}`);
      err.status = r.status;
      throw err;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`FaceMatch verification JSON inválido: ${e.message}`);
    }
    const sim = extractVerificationBestSimilarity(data);
    if (!Number.isFinite(sim)) {
      throw new Error('FaceMatch verification devolveu resposta sem similaridade.');
    }
    return sim;
  }

  let lastErr;
  for (const root of roots) {
    const base = String(root).replace(/\/+$/, '');
    try {
      if (idDocumentPairing) {
        const [a, b] = await Promise.allSettled([
          postVerifyPair(
            probePart.blob,
            probePart.filename,
            refPart.blob,
            refPart.filename,
            base
          ),
          postVerifyPair(
            refPart.blob,
            refPart.filename,
            probePart.blob,
            probePart.filename,
            base
          ),
        ]);
        const scores = [];
        let partialErr = null;
        if (a.status === 'fulfilled') scores.push(a.value);
        else partialErr = a.reason;
        if (b.status === 'fulfilled') scores.push(b.value);
        else if (!partialErr) partialErr = b.reason;
        if (scores.length > 0) {
          return Math.max.apply(null, scores);
        }
        throw partialErr || new Error('Falha na verificação facial.');
      }
      /** `COMPREFACE_VERIFICATION_SINGLE_DIRECTION=1`: uma ida à API por par (mais rápido; menos conservador). */
      if (singleDirection) {
        return postVerifyPair(probePart.blob, probePart.filename, refPart.blob, refPart.filename, base);
      }
      const [s1, s2] = await Promise.all([
        postVerifyPair(probePart.blob, probePart.filename, refPart.blob, refPart.filename, base),
        postVerifyPair(refPart.blob, refPart.filename, probePart.blob, probePart.filename, base),
      ]);
      return Math.min(s1, s2);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Falha na verificação facial.');
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
    const err = new Error(`FaceMatch add face HTTP ${r.status}: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
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
  isFaceMatchNoFaceInImageError,
  pickTopRecognitionMatch,
  flattenRecognitionSubjectCandidates,
  ensureSubject,
  deleteFacesForSubject,
  listRecognitionSubjects,
  deleteStaleBrsparkSubjectFacesForUser,
  addFaceToSubject,
  verifyFacePairWithIntegration,
  extractVerificationBestSimilarity,
};
