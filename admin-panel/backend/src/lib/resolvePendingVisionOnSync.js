'use strict';

const {
  prismaWhereVisionChecklistIntegration,
  normalizeVisionAnalyzeResponse,
  buildMultipartBuffer,
  fetchVisionPostPreservingMethod,
} = require('./visionChecklistAnalyze');
const { findGoogleAiStudioIntegration, analyzeWithGoogleAiStudio } = require('./visionStudioAnalyze');
const { findMoondreamIntegration, analyzeWithMoondream } = require('./visionMoondreamAnalyze');
const { pickVisionDetectionBackend } = require('./visionDetectionRouting');
const { consumeQuota } = require('./planQuotaService');
const { MAX_VISION_STRUCTURED_PROMPT_CHARS } = require('../constants/visionSimNaoQuestions');

function sectionRepeatStorageKey(sectionId) {
  return `__section_repeat_${sectionId}`;
}

function getRepeatRows(responses, sectionId) {
  const raw = responses[sectionRepeatStorageKey(sectionId)];
  return Array.isArray(raw) ? raw : [];
}

function getScopedFieldValue(responses, scope, fieldId) {
  if (!scope) return responses[fieldId];
  const rows = getRepeatRows(responses, scope.sectionId);
  const row = rows[scope.rowIndex];
  return row && typeof row === 'object' ? row[fieldId] : undefined;
}

function setScopedFieldValue(responses, scope, fieldId, value) {
  if (!scope) {
    responses[fieldId] = value;
    return;
  }
  const rows = getRepeatRows(responses, scope.sectionId);
  const row = rows[scope.rowIndex];
  if (!row || typeof row !== 'object') return;
  row[fieldId] = value;
}

function sanitizeVisionQuestionId(raw, index) {
  const fallback = `q${index + 1}`;
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  const cleaned = s.replace(/[^\w-]/g, '_').slice(0, 64);
  return cleaned || fallback;
}

function effectiveFieldType(field) {
  return String(field?.type || '').trim();
}

function normalizeVisionGridSlotUris(raw, count) {
  const out = Array.from({ length: count }, () => '');
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < count && i < raw.length; i++) {
    const u = raw[i];
    out[i] = u != null && String(u).trim() ? String(u).trim() : '';
  }
  return out;
}

/** Alinhado ao app: grelha só em `vision_ai_analysis`. */
function visionAnalysisGridCount(field) {
  if (effectiveFieldType(field) !== 'vision_ai_analysis') return 1;
  const s = String(field?.visionAnalysisGrid || field?.vision_analysis_grid || '1x1')
    .trim()
    .toLowerCase()
    .replace(/\*/g, 'x');
  if (s === '2x2' || s === '2x1' || s === '3x1' || s === '3x2' || s === '3x3') return 4;
  return 1;
}

function parseVisionStored(raw) {
  if (raw === undefined || raw === null) return null;
  let o = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
}

function isVisionPendingAnalysis(o) {
  return o && String(o.status || '').toLowerCase() === 'pending_analysis';
}

function visionRunnableHttpMedia(field, o) {
  const localUri = o.localUri != null ? String(o.localUri).trim() : '';
  if (!localUri.startsWith('http://') && !localUri.startsWith('https://')) return false;
  const n = visionAnalysisGridCount(field);
  if (n <= 1) return true;
  const slots = normalizeVisionGridSlotUris(o.gridSlotUris, n);
  return slots.every((u) => u.length > 0);
}

function getVisionQuestionsFromField(field) {
  const cfg = field?.config && typeof field.config === 'object' ? field.config : undefined;
  const structured = String(
    field?.visionStructuredPrompt ??
      field?.vision_structured_prompt ??
      cfg?.visionStructuredPrompt ??
      cfg?.vision_structured_prompt ??
      '',
  ).trim();

  const vq = field?.visionQuestions ?? field?.vision_questions ?? cfg?.visionQuestions;

  const items = [];
  if (Array.isArray(vq)) {
    for (let i = 0; i < vq.length; i++) {
      const x = vq[i];
      if (!x || typeof x !== 'object') continue;
      const text = String(x.text || x.question || '').trim();
      if (!text) continue;
      const id = String(x.id || '').trim();
      items.push({ id, text });
    }
  }

  const ft = effectiveFieldType(field);

  if (ft === 'vision_ai_analysis') {
    if (structured) {
      return [{ id: 'q1', text: structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS) }];
    }
    if (!items.length) return [];
    if (items.length >= 2) {
      const joined = items
        .map((it) => it.text)
        .join('\n\n')
        .slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
      return joined ? [{ id: 'q1', text: joined }] : [];
    }
    return [
      {
        id: sanitizeVisionQuestionId(items[0].id, 0),
        text: items[0].text.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS),
      },
    ];
  }

  /** Detecção (YOLO): sempre um único critério `q1` (modelos antigos com várias linhas são fundidos). */
  if (ft === 'vision_checklist') {
    if (structured) {
      return [{ id: 'q1', text: structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS) }];
    }
    if (!items.length) return [];
    if (items.length >= 2) {
      const joined = items
        .map((it) => it.text)
        .join('\n\n')
        .slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS);
      return joined ? [{ id: 'q1', text: joined }] : [];
    }
    return [
      {
        id: sanitizeVisionQuestionId(items[0].id, 0),
        text: items[0].text.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS),
      },
    ];
  }

  if (structured) {
    return [{ id: 'q1', text: structured.slice(0, MAX_VISION_STRUCTURED_PROMPT_CHARS) }];
  }
  return [];
}

async function fetchBinaryFromHttpUrl(url) {
  const u = String(url || '').trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return null;
  try {
    const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!res.ok) return null;
    const len = res.headers.get('content-length');
    if (len && Number(len) > 95 * 1024 * 1024) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    return buf.length >= 64 ? buf : null;
  } catch (e) {
    console.warn('[resolvePendingVisionOnSync] fetch mídia falhou', u.slice(0, 120), e && e.message);
    return null;
  }
}

function inferMimeFromUrlAndType(url, contentType, storedMime) {
  const sm = String(storedMime || '').split(';')[0].trim().toLowerCase();
  if (sm && sm !== 'application/octet-stream') return sm;
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct && ct !== 'application/octet-stream' && ct !== 'binary/octet-stream') return ct;
  const path = String(url).split('?')[0].toLowerCase();
  if (/\.(mp4|m4v)(\?|$)/i.test(path)) return 'video/mp4';
  if (/\.(webm)(\?|$)/i.test(path)) return 'video/webm';
  if (/\.(mov|qt)(\?|$)/i.test(path)) return 'video/quicktime';
  if (/\.(png)(\?|$)/i.test(path)) return 'image/png';
  if (/\.(jpe?g)(\?|$)/i.test(path)) return 'image/jpeg';
  if (/\.(webp)(\?|$)/i.test(path)) return 'image/webp';
  if (/\.(heic|heif)(\?|$)/i.test(path)) return 'image/heic';
  return 'application/octet-stream';
}

function pickFilenameFromUrl(url, fallback) {
  try {
    const p = new URL(String(url)).pathname.split('/').pop();
    if (p && p.length < 200) return p;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Completar campos `vision_*` em `pending_analysis` quando já há URL HTTP(S) (sync pós-upload).
 * @returns {Promise<number>} campos atualizados
 */
async function resolvePendingVisionAnalysisOnSync(prisma, { responses, templateId, tenantId }) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return 0;
  if (!templateId || !tenantId) return 0;

  const tmpl = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    select: { schemaData: true },
  });
  const schema = Array.isArray(tmpl?.schemaData) ? tmpl.schemaData : [];
  if (!schema.length) return 0;

  const tenantFeat = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { features: true },
  });
  const tf =
    tenantFeat?.features && typeof tenantFeat.features === 'object' && !Array.isArray(tenantFeat.features)
      ? tenantFeat.features
      : {};
  let updated = 0;
  let currentSectionId = null;
  let curSecRepeat = false;

  const tryResolveOne = async (field, scope) => {
    const fieldId = String(field.id || '').trim();
    if (!fieldId) return;
    const raw = getScopedFieldValue(responses, scope, fieldId);
    const o = parseVisionStored(raw);
    if (!o || !isVisionPendingAnalysis(o) || !visionRunnableHttpMedia(field, o)) return;

    const qs = getVisionQuestionsFromField(field);
    if (!qs.length) {
      console.warn('[resolvePendingVisionOnSync] sem perguntas no modelo', fieldId);
      return;
    }

    const mediaUrl = String(o.localUri).trim();
    const buf = await fetchBinaryFromHttpUrl(mediaUrl);
    if (!buf) return;

    const mime = inferMimeFromUrlAndType(mediaUrl, '', o.mediaMimeType);
    const fileName =
      String(o.mediaFileName || '').trim() ||
      pickFilenameFromUrl(mediaUrl, mime.startsWith('video/') ? 'upload.mp4' : 'upload.jpg');

    const ft = effectiveFieldType(field);

    if (ft === 'vision_checklist' && String(mime).toLowerCase().startsWith('video/')) {
      console.warn(
        '[resolvePendingVisionOnSync] vídeo+YOLO no sync não suportado no servidor (sem extração de frame); campo',
        fieldId,
      );
      return;
    }

    let normalized;
    if (ft === 'vision_ai_analysis') {
      const studioInt = await findGoogleAiStudioIntegration();
      if (!studioInt || !String(studioInt.apiKey || '').trim()) return;
      const q = await consumeQuota(prisma, tenantId, 'AI_VISION_ANALYSIS', 1);
      if (!q.ok) {
        console.warn('[resolvePendingVisionOnSync] quota Gemini', q.error);
        return;
      }
      const visionRating0To10 = field?.visionRating0To10Enabled === true;
      normalized = await analyzeWithGoogleAiStudio({
        buffer: buf,
        mimetype: mime || 'application/octet-stream',
        questions: qs,
        integration: studioInt,
        visionRating0To10,
      });
    } else if (ft === 'vision_checklist') {
      const yoloIntegration = await prisma.integration.findFirst({
        where: prismaWhereVisionChecklistIntegration(),
      });
      const yoloOk = !!(yoloIntegration && String(yoloIntegration.baseUrl || '').trim());
      const moonIntegration = await findMoondreamIntegration();
      const moonOk = !!(moonIntegration && String(moonIntegration.apiKey || '').trim());
      let { useMoondream: useMoon } = pickVisionDetectionBackend(tf, { yoloOk, moonOk });

      const qd = await consumeQuota(prisma, tenantId, 'AI_VISION_DETECTION', 1);
      if (!qd.ok) {
        console.warn('[resolvePendingVisionOnSync] quota visão detecção', qd.error);
        return;
      }

      if (useMoon) {
        if (!moonOk) return;
        const visionRating0To10 = field?.visionRating0To10Enabled === true;
        normalized = await analyzeWithMoondream({
          buffer: buf,
          mimetype: mime || 'application/octet-stream',
          questions: qs,
          integration: moonIntegration,
          visionRating0To10,
        });
      } else {
        const integration = yoloIntegration;
        if (!integration || !String(integration.baseUrl || '').trim()) return;
        const baseUrl = String(integration.baseUrl).trim().replace(/\/+$/, '');
        const apiKey = integration.apiKey != null ? String(integration.apiKey).trim() : '';
        const isVideo = String(mime).toLowerCase().startsWith('video/');
        const boundary = '----BrSparkVisionSync' + Date.now().toString(36);
        const bodyBuf = buildMultipartBuffer(boundary, [
          {
            name: 'media',
            value: buf,
            filename: fileName || (isVideo ? 'upload.mp4' : 'upload.jpg'),
            contentType: mime || 'application/octet-stream',
          },
          { name: 'questions', value: JSON.stringify(qs) },
          { name: 'schemaVersion', value: '1' },
        ]);
        const timeoutMs =
          integration.metadata &&
          typeof integration.metadata === 'object' &&
          integration.metadata.timeoutMs != null
            ? Math.min(300_000, Math.max(10_000, parseInt(String(integration.metadata.timeoutMs), 10) || 120_000))
            : 120_000;
        const extRes = await fetchVisionPostPreservingMethod(baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: bodyBuf,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await extRes.text();
        if (!extRes.ok) {
          console.warn('[resolvePendingVisionOnSync] YOLO HTTP', extRes.status, text.slice(0, 200));
          return;
        }
        normalized = normalizeVisionAnalyzeResponse(text, qs);
      }
    } else {
      return;
    }

    if (!normalized || !normalized.ok || !normalized.payload) {
      console.warn('[resolvePendingVisionOnSync] análise falhou', fieldId, normalized && normalized.error);
      return;
    }

    const pl = normalized.payload;
    const merged = {
      ...pl,
      localUri: o.localUri,
      mediaMimeType: o.mediaMimeType || mime,
      mediaFileName: o.mediaFileName || fileName,
    };
    if (Array.isArray(o.gridSlotUris)) merged.gridSlotUris = o.gridSlotUris;
    if (o.captureLat != null && String(o.captureLat).trim() && o.captureLng != null && String(o.captureLng).trim()) {
      merged.captureLat = String(o.captureLat).trim();
      merged.captureLng = String(o.captureLng).trim();
    }
    if (typeof o.captureAddr === 'string' && o.captureAddr.trim()) {
      merged.captureAddr = o.captureAddr.trim();
    }

    setScopedFieldValue(responses, scope, fieldId, merged);
    updated += 1;
  };

  for (const f of schema) {
    if (f && f.type === 'section_break') {
      currentSectionId = f.id ? String(f.id) : null;
      curSecRepeat = f.multiple === true;
      continue;
    }
    const ft = effectiveFieldType(f);
    if (ft !== 'vision_checklist' && ft !== 'vision_ai_analysis') continue;

    if (!curSecRepeat) {
      await tryResolveOne(f, null);
    } else if (currentSectionId) {
      const rows = getRepeatRows(responses, currentSectionId);
      for (let ri = 0; ri < rows.length; ri++) {
        await tryResolveOne(f, { sectionId: currentSectionId, rowIndex: ri });
      }
    }
  }

  return updated;
}

module.exports = {
  resolvePendingVisionAnalysisOnSync,
};
