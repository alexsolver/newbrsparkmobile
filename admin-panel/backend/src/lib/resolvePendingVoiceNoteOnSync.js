'use strict';

const { transcribeAudioWithOpenAiWhisper } = require('./openAiWhisperTranscribe');

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

function parseVoiceStored(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    try {
      const j = JSON.parse(t);
      return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
    } catch {
      return { transcript: t, phase: 'done', status: 'completed' };
    }
  }
  return null;
}

function isPendingVoiceRecord(o) {
  if (!o || typeof o !== 'object') return false;
  const transcript = String(o.transcript || '').trim();
  if (transcript) return false;
  const phase = String(o.phase || o.status || '').trim().toLowerCase();
  return phase === 'pending_transcription';
}

function pendingVoiceHttpUri(o) {
  const uri = String(o?.localUri || '').trim();
  if (!uri) return '';
  if (!uri.startsWith('http://') && !uri.startsWith('https://')) return '';
  return uri;
}

function normalizeLanguage(lang) {
  const s = String(lang || 'pt').trim().slice(0, 12);
  return s || 'pt';
}

function normalizeMime(rawMime, url) {
  const m = String(rawMime || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (m.startsWith('audio/') || m === 'video/mp4') return m;
  const path = String(url || '').split('?')[0].toLowerCase();
  if (path.endsWith('.m4a')) return 'audio/m4a';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.webm')) return 'audio/webm';
  if (path.endsWith('.ogg')) return 'audio/ogg';
  if (path.endsWith('.flac')) return 'audio/flac';
  if (path.endsWith('.mp4') || path.endsWith('.m4v') || path.endsWith('.mov')) return 'video/mp4';
  return 'audio/m4a';
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

async function fetchBinaryFromHttpUrl(url) {
  const u = String(url || '').trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return null;
  try {
    const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!res.ok) return null;
    const len = Number(res.headers.get('content-length') || 0);
    if (Number.isFinite(len) && len > 24 * 1024 * 1024) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length < 128 || buf.length > 24 * 1024 * 1024) return null;
    return buf;
  } catch (e) {
    console.warn('[resolvePendingVoiceNoteOnSync] fetch áudio falhou', u.slice(0, 120), e && e.message);
    return null;
  }
}

function extractVoiceFields(schemaData) {
  const fields = [];
  if (!Array.isArray(schemaData)) return fields;

  let currentSectionId = null;
  let currentSectionRepeat = false;
  for (const f of schemaData) {
    if (f && f.type === 'section_break') {
      currentSectionId = f.id ? String(f.id) : null;
      currentSectionRepeat = f.multiple === true;
      continue;
    }
    if (!f || String(f.type || '').trim() !== 'voice_note') continue;
    const fieldId = String(f.id || '').trim();
    if (!fieldId) continue;
    fields.push({
      id: fieldId,
      sectionId: currentSectionRepeat ? currentSectionId : null,
      language: normalizeLanguage(f.voiceTranscribeLanguage || f.voice_transcribe_language || 'pt'),
    });
  }
  return fields;
}

/**
 * Resolve campos `voice_note` pendentes (`pending_transcription`) no sync, quando `localUri` já virou URL pública.
 * @returns {Promise<number>} campos atualizados
 */
async function resolvePendingVoiceNotesOnSync(prisma, { responses, templateId }) {
  if (!responses || typeof responses !== 'object' || Array.isArray(responses)) return 0;
  if (!templateId) return 0;

  const tmpl = await prisma.checklistTemplate.findUnique({
    where: { id: templateId },
    select: { schemaData: true },
  });
  const voiceFields = extractVoiceFields(tmpl?.schemaData);
  if (!voiceFields.length) return 0;

  let updated = 0;

  for (const field of voiceFields) {
    const scopes = field.sectionId
      ? getRepeatRows(responses, field.sectionId).map((_, rowIndex) => ({ sectionId: field.sectionId, rowIndex }))
      : [null];

    for (const scope of scopes) {
      const raw = getScopedFieldValue(responses, scope, field.id);
      const o = parseVoiceStored(raw);
      if (!o || !isPendingVoiceRecord(o)) continue;

      const mediaUrl = pendingVoiceHttpUri(o);
      if (!mediaUrl) continue;

      const buf = await fetchBinaryFromHttpUrl(mediaUrl);
      if (!buf) continue;

      const mime = normalizeMime(o.mimeType || o.mediaMimeType || '', mediaUrl);
      const fileName =
        String(o.fileName || o.mediaFileName || '').trim() ||
        pickFilenameFromUrl(mediaUrl, mime.startsWith('video/') ? 'nota_voz.mp4' : 'nota_voz.m4a');
      const language = normalizeLanguage(o.language || field.language || 'pt');

      const out = await transcribeAudioWithOpenAiWhisper({
        buffer: buf,
        mimetype: mime,
        filename: fileName,
        language,
      });
      if (!out.ok) {
        console.warn('[resolvePendingVoiceNoteOnSync] transcrição falhou', field.id, out.error);
        continue;
      }
      const tr = String(out.text || '').trim();
      if (!tr) continue;

      const merged = {
        ...o,
        transcript: tr,
        phase: 'done',
        status: 'completed',
        error: undefined,
        localUri: mediaUrl,
        mimeType: mime,
        fileName,
        language,
      };

      setScopedFieldValue(responses, scope, field.id, merged);
      updated += 1;
    }
  }

  return updated;
}

module.exports = {
  resolvePendingVoiceNotesOnSync,
};
