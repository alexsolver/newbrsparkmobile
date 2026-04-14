/**
 * /api/tracking — Public real-time technician tracking
 * 
 * No adminAuth: these endpoints are either called by the mobile app 
 * (with bearer token) OR are fully public (GET /:token).
 */

const express = require('express');
const router  = express.Router();
const prisma  = require('../db');
const { Prisma } = require('@prisma/client');
const crypto  = require('crypto');
const { sendClientProviderEnRoutePush } = require('../lib/clientProviderEnRoutePush');
const authUser = require('../middleware/authUser');
const { COPY } = require('../lib/trackingChatModerationPolicy');
const { pointsDeltaForSeverity, THRESHOLD_ALERT } = require('../lib/trackingChatModerationEngine');
const { runModerationPipeline, persistModerationEvent, getModState } = require('../lib/trackingChatPipeline');

/** Sem GPS com coordenadas dentro deste intervalo → "sem sinal" no link público. Padrão 10 min (mau sinal / intervalos de GPS). Override: TRACKING_GPS_STALE_SEC. */
const DISPLACEMENT_GPS_STALE_SEC = Math.min(
  3600,
  Math.max(120, Number(process.env.TRACKING_GPS_STALE_SEC) || 600)
);

/** Após POST /api/tracking/end: o link público (mapa + chat) deixa de responder após esta janela. Padrão 30 min; override: TRACKING_EXPIRE_AFTER_END_MINUTES. */
const TRACKING_GRACE_AFTER_END_MS = (() => {
  const n = Number(process.env.TRACKING_EXPIRE_AFTER_END_MINUTES);
  const min = Number.isFinite(n) && n > 0 ? n : 30;
  return Math.min(48 * 60, Math.max(5, min)) * 60 * 1000;
})();

// Generates a URL-safe random token (16 bytes = 32 hex chars)
const makeToken = () => crypto.randomBytes(12).toString('hex'); // 24 chars

/** Evita spread de `metadata` null (typeof null === 'object') ou string JSON legada. */
function cloneExecMetadata(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object' && !Array.isArray(p)) return { ...p };
    } catch (_) {
      /* ignore */
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw };
  return {};
}

const TRACKING_CHAT_KEY = 'trackingChatMessages';
const MAX_TRACKING_CHAT_MESSAGES = 120;
const MAX_TRACKING_CHAT_TEXT = 900;

function sameOwnerEmail(execEmail, jwtEmail) {
  if (!execEmail || !jwtEmail) return false;
  return String(execEmail).trim().toLowerCase() === String(jwtEmail).trim().toLowerCase();
}

function normalizeChatMessages(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const id = typeof m.id === 'string' && m.id.trim() ? m.id.trim() : null;
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    const at = typeof m.at === 'string' && m.at.trim() ? m.at.trim() : null;
    const role = m.role === 'tech' ? 'tech' : m.role === 'system' ? 'system' : 'client';
    const senderLabel =
      typeof m.senderLabel === 'string' && m.senderLabel.trim() ? m.senderLabel.trim().slice(0, 80) : null;
    const kind = typeof m.kind === 'string' && m.kind.trim() ? m.kind.trim().slice(0, 48) : null;
    if (!id || !text || !at) continue;
    const row = {
      id,
      role,
      text: text.slice(0, MAX_TRACKING_CHAT_TEXT),
      at,
      senderLabel: role === 'system' ? null : senderLabel,
    };
    if (kind) row.kind = kind;
    out.push(row);
  }
  return out.slice(-MAX_TRACKING_CHAT_MESSAGES);
}

/** Mesma janela do GET público: até trackingExpiredAt (ou sem limite se ainda não definido). */
function isTrackingChatExpired(meta) {
  if (!meta || typeof meta !== 'object') return true;
  if (meta.trackingExpiredAt && new Date() > new Date(meta.trackingExpiredAt)) return true;
  return false;
}

function trackingChatAllowed(meta) {
  if (!meta || typeof meta !== 'object') return false;
  if (!meta.trackingToken) return false;
  if (isTrackingChatExpired(meta)) return false;
  return true;
}

/** Corpo JSON, string JSON ou objeto vazio (proxies / clientes legados). */
function readChatTextFromBody(req) {
  let b = req.body;
  if (b == null) return '';
  if (typeof b === 'string') {
    const s = b.trim();
    if (!s) return '';
    try {
      b = JSON.parse(s);
    } catch {
      return s;
    }
  }
  if (typeof b !== 'object' || Array.isArray(b)) return '';
  const raw = b.text != null ? b.text : b.message != null ? b.message : '';
  return String(raw).trim();
}

function readForceSend(req) {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
  return !!(b.ackModerationWarning || b.forceSend || b.moderationOverrideAck);
}

function conductBannerMessage() {
  return {
    id: crypto.randomBytes(8).toString('hex'),
    role: 'system',
    kind: 'conduct_banner',
    text: COPY.conductBanner,
    at: new Date().toISOString(),
  };
}

function ensureConductBannerInMeta(meta) {
  const list = normalizeChatMessages(meta[TRACKING_CHAT_KEY]);
  if (list.some((m) => m.kind === 'conduct_banner')) return list;
  return [conductBannerMessage(), ...list].slice(-MAX_TRACKING_CHAT_MESSAGES);
}

/** Resposta GET: inclui banner de conduta mesmo em execuções antigas (sem gravar). */
function chatMessagesForApiResponse(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  return normalizeChatMessages(ensureConductBannerInMeta(m));
}

const selectExecForToken = {
  id: true,
  ownerEmail: true,
  status: true,
  metadata: true,
};

async function findExecutionByTrackingToken(token) {
  if (!token || typeof token !== 'string') return null;
  let exec = await prisma.checklistExecution.findFirst({
    where: {
      status: { not: 'CANCELLED' },
      metadata: { path: ['trackingToken'], equals: token },
    },
    select: selectExecForToken,
  });
  if (!exec) {
    const execs = await prisma.checklistExecution.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: selectExecForToken,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    exec =
      execs.find((e) => {
        const m = e.metadata;
        return m && typeof m === 'object' && m.trackingToken === token;
      }) || null;
  }
  return exec;
}

async function findExecutionByTokenForChat(token) {
  const base = await findExecutionByTrackingToken(token);
  if (!base) return null;
  return prisma.checklistExecution.findUnique({
    where: { id: base.id },
    select: {
      id: true,
      ownerEmail: true,
      metadata: true,
      template: { select: { tenantId: true, tenant: { select: { features: true } } } },
    },
  });
}

async function mergeChatMetadata(executionId, fn) {
  const exec = await prisma.checklistExecution.findUnique({
    where: { id: executionId },
    select: { metadata: true },
  });
  if (!exec) throw new Error('OS não encontrada');
  const meta = cloneExecMetadata(exec.metadata);
  fn(meta);
  await prisma.checklistExecution.update({
    where: { id: executionId },
    data: { metadata: meta },
  });
  return normalizeChatMessages(meta[TRACKING_CHAT_KEY]);
}

/**
 * @param {import('express').Response} res
 * @param {{ req: import('express').Request, exec: any, textIn: string, actorRole: 'client'|'tech', techSenderLabel?: string|null }} opts
 */
async function processModeratedChatPost(res, opts) {
  const { req, exec, textIn, actorRole, techSenderLabel } = opts;
  const forceSend = readForceSend(req);
  const meta0 = exec.metadata && typeof exec.metadata === 'object' ? exec.metadata : {};
  const tenantFeatures = exec.template?.tenant?.features;
  const tenantId = exec.template?.tenantId || null;

  const pipe = await runModerationPipeline({
    text: textIn,
    actorRole,
    executionId: exec.id,
    tenantId,
    tenantFeatures,
    meta: meta0,
    forceSend,
  });

  await persistModerationEvent({
    executionId: exec.id,
    tenantId,
    actorRole,
    text: textIn,
    pipelineResult: pipe,
    storeFullText: pipe.policy.storeFullText,
  });

  const st0 = getModState(meta0);
  let delta = 0;
  const { finalAction, userMessage, systemBanner, canOverride } = pipe.decision;
  const sev = pipe.sig.severity || 'low';

  if (pipe.policy.stage !== 'observe') {
    if (finalAction === 'allow_warn') delta = pointsDeltaForSeverity('low');
    else if (finalAction === 'request_rewrite') delta = pointsDeltaForSeverity(sev === 'high' ? 'high' : 'medium');
    else if (finalAction === 'block') delta = pointsDeltaForSeverity(sev === 'high' ? 'high' : 'medium');
  }

  const st1 = {
    pointsClient: st0.pointsClient + (actorRole === 'client' ? delta : 0),
    pointsTech: st0.pointsTech + (actorRole === 'tech' ? delta : 0),
  };

  if (finalAction === 'allow' || finalAction === 'allow_warn') {
    const userEntry = {
      id: crypto.randomBytes(10).toString('hex'),
      role: actorRole,
      text: textIn.slice(0, MAX_TRACKING_CHAT_TEXT),
      at: new Date().toISOString(),
      senderLabel: actorRole === 'tech' ? techSenderLabel || null : 'Cliente',
    };
    const extras = [];
    if (systemBanner) {
      extras.push({
        id: crypto.randomBytes(8).toString('hex'),
        role: 'system',
        kind: 'conduct_reminder',
        text: systemBanner,
        at: new Date().toISOString(),
      });
    }
    const crossedAlert =
      (actorRole === 'client'
        ? st0.pointsClient < THRESHOLD_ALERT && st1.pointsClient >= THRESHOLD_ALERT
        : st0.pointsTech < THRESHOLD_ALERT && st1.pointsTech >= THRESHOLD_ALERT);
    if (crossedAlert) {
      extras.push({
        id: crypto.randomBytes(8).toString('hex'),
        role: 'system',
        kind: 'conduct_recurrence',
        text: COPY.recurrence,
        at: new Date().toISOString(),
      });
    }
    const messages = await mergeChatMetadata(exec.id, (meta) => {
      meta.trackingChatModState = st1;
      let list = normalizeChatMessages(meta[TRACKING_CHAT_KEY]);
      for (const x of extras) list.push(x);
      list.push(userEntry);
      while (list.length > MAX_TRACKING_CHAT_MESSAGES) list.shift();
      meta[TRACKING_CHAT_KEY] = list;
    });
    return res.json({ ok: true, messages });
  }

  if (finalAction === 'request_rewrite' || finalAction === 'block' || finalAction === 'escalate_review') {
    const sysText = finalAction === 'block' || finalAction === 'escalate_review' ? COPY.blockHard : userMessage || COPY.requestRewrite;
    const kind =
      finalAction === 'block' || finalAction === 'escalate_review' ? 'moderation_block' : 'moderation_rewrite';
    const messages = await mergeChatMetadata(exec.id, (meta) => {
      meta.trackingChatModState = st1;
      const list = normalizeChatMessages(meta[TRACKING_CHAT_KEY]);
      list.push({
        id: crypto.randomBytes(8).toString('hex'),
        role: 'system',
        kind,
        text: sysText,
        at: new Date().toISOString(),
      });
      while (list.length > MAX_TRACKING_CHAT_MESSAGES) list.shift();
      meta[TRACKING_CHAT_KEY] = list;
    });
    return res.status(422).json({
      ok: false,
      code: 'CHAT_MODERATION',
      decision: finalAction,
      severity: pipe.sig.severity,
      category: pipe.sig.category,
      userMessage: userMessage || COPY.requestRewrite,
      canOverride: !!canOverride && finalAction === 'request_rewrite',
      messages,
    });
  }

  console.error('[TRACKING] moderação: ação inesperada', pipe.decision?.finalAction);
  return res.status(500).json({ error: 'Falha interna na moderação do chat.' });
}

// ─── POST /api/tracking/start/:taskId ────────────────────────────────────────
// Called by mobile app when technician presses "Iniciar Deslocamento".
// Creates a unique public token linked to this execution.
router.post('/start/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });

    // Idempotent: reuse existing token if already started
    const existingToken = exec.metadata?.trackingToken;
    if (existingToken) {
      const url = `${req.protocol}://${req.get('host')}/track.html?t=${existingToken}`;
      sendClientProviderEnRoutePush({ executionId: taskId, trackingUrl: url }).catch((e) =>
        console.warn('[TRACKING] push cliente (en route):', e?.message || e)
      );
      return res.json({ token: existingToken, url });
    }

    const token = makeToken();
    const meta  = cloneExecMetadata(exec.metadata);

    const metaNew = {
      ...meta,
      trackingToken: token,
      trackingStartedAt: new Date().toISOString(),
      trackingExpiredAt: null,
    };
    metaNew[TRACKING_CHAT_KEY] = ensureConductBannerInMeta(metaNew);

    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { metadata: metaNew },
    });

    const url = `${req.protocol}://${req.get('host')}/track.html?t=${token}`;
    console.log(`[TRACKING] ✅ Token criado para ${taskId}: ${token}`);
    sendClientProviderEnRoutePush({ executionId: taskId, trackingUrl: url }).catch((e) =>
      console.warn('[TRACKING] push cliente (en route):', e?.message || e)
    );
    res.json({ token, url });
  } catch (err) {
    console.error('[TRACKING] start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tracking/end/:taskId ──────────────────────────────────────────
// Called by mobile app when technician finishes transit.
// Expira o link público após TRACKING_GRACE_AFTER_END_MS (padrão 30 min).
router.post('/end/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });

    const meta = cloneExecMetadata(exec.metadata);
    const expiry = new Date(Date.now() + TRACKING_GRACE_AFTER_END_MS);

    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...meta,
          trackingEndedAt:   new Date().toISOString(),
          trackingExpiredAt: expiry.toISOString(),
        },
      },
    });

    console.log(`[TRACKING] 🏁 Deslocamento encerrado ${taskId}, expira em ${expiry.toISOString()}`);
    res.json({ ok: true, expiresAt: expiry.toISOString() });
  } catch (err) {
    console.error('[TRACKING] end error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tracking/pause/:taskId ──────────────────────────────────────────
router.post('/pause/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    const meta = cloneExecMetadata(exec.metadata);
    meta.trackingPaused = true;
    meta.trackingPausedAt = new Date().toISOString();
    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { metadata: meta },
    });
    console.log(`[TRACKING] ⏸ Pausa gravada ${taskId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tracking/resume/:taskId ──────────────────────────────────────────
router.post('/resume/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    const meta = cloneExecMetadata(exec.metadata);
    meta.trackingPaused = false;
    delete meta.trackingPausedAt;
    await prisma.checklistExecution.update({
      where: { id: taskId },
      data: { metadata: meta },
    });
    console.log(`[TRACKING] ▶ Retomada gravada ${taskId}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Chat (cliente via token público / técnico via JWT) — mensagens em metadata ──

router.get('/task/:taskId/chat', authUser, async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({
      where: { id: taskId },
      select: { id: true, ownerEmail: true, metadata: true },
    });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para esta OS.' });
    }
    const meta = exec.metadata && typeof exec.metadata === 'object' ? exec.metadata : {};
    if (!trackingChatAllowed(meta)) {
      return res.status(400).json({ error: 'Chat indisponível (link expirado ou deslocamento não iniciado).' });
    }
    const messages = chatMessagesForApiResponse(meta);
    res.json({ messages });
  } catch (err) {
    console.error('[TRACKING] chat GET (task) error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/task/:taskId/chat', authUser, async (req, res) => {
  try {
    const { taskId } = req.params;
    const textIn = readChatTextFromBody(req);
    if (!textIn) return res.status(400).json({ error: 'Mensagem vazia.' });

    const exec = await prisma.checklistExecution.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        ownerEmail: true,
        metadata: true,
        template: { select: { tenantId: true, tenant: { select: { features: true } } } },
      },
    });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para esta OS.' });
    }
    const meta = exec.metadata && typeof exec.metadata === 'object' ? exec.metadata : {};
    if (!trackingChatAllowed(meta)) {
      return res.status(400).json({ error: 'Chat indisponível (link expirado ou deslocamento não iniciado).' });
    }

    let techSenderLabel = 'Técnico';
    try {
      const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { name: true },
      });
      if (u?.name && String(u.name).trim()) techSenderLabel = String(u.name).trim().slice(0, 80);
    } catch (_) {}

    await processModeratedChatPost(res, { req, exec, textIn, actorRole: 'tech', techSenderLabel });
  } catch (err) {
    console.error('[TRACKING] chat POST (task) error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:token/chat', async (req, res) => {
  try {
    const { token } = req.params;
    const exec = await findExecutionByTrackingToken(token);
    if (!exec) return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    const meta = exec.metadata && typeof exec.metadata === 'object' ? exec.metadata : {};
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    if (isTrackingChatExpired(meta)) {
      return res.status(410).json({ expired: true, error: 'Este link de rastreamento expirou.' });
    }
    if (!trackingChatAllowed(meta)) {
      return res.status(400).json({ error: 'Chat indisponível (link expirado ou deslocamento não iniciado).' });
    }
    const messages = chatMessagesForApiResponse(meta);
    res.json({ messages });
  } catch (err) {
    console.error('[TRACKING] chat GET (token) error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:token/chat', async (req, res) => {
  try {
    const { token } = req.params;
    const textIn = readChatTextFromBody(req);
    if (!textIn) return res.status(400).json({ error: 'Mensagem vazia.' });

    const exec = await findExecutionByTokenForChat(token);
    if (!exec) return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    const meta = exec.metadata && typeof exec.metadata === 'object' ? exec.metadata : {};
    res.setHeader('Cache-Control', 'no-store');
    if (isTrackingChatExpired(meta)) {
      return res.status(410).json({ expired: true, error: 'Este link de rastreamento expirou.' });
    }
    if (!meta.trackingToken || meta.trackingToken !== token) {
      return res.status(404).json({ error: 'Link inválido.' });
    }

    await processModeratedChatPost(res, { req, exec, textIn, actorRole: 'client', techSenderLabel: null });
  } catch (err) {
    console.error('[TRACKING] chat POST (token) error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/tracking/:token ─────────────────────────────────────────────────
// FULLY PUBLIC — no auth required.
// Returns real-time technician position, ETA, name, avatar, service info.
/** Lê pausa do metadata mesmo se vier string/number do JSON legado */
function isTrackingPaused(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const v = meta.trackingPaused;
  if (v === false || v === 0 || v === 'false' || v === '0') return false;
  if (v === true || v === 1) return true;
  if (v === 'true' || v === '1') return true;
  return false;
}

router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const selectExec = {
      id:                true,
      ownerEmail:        true,
      status:            true,
      etaMinutes:        true,
      locationLat:       true,
      locationLng:       true,
      locationAddress:   true,
      locationZoneType:  true,
      locationPolygon:   true,
      metadata:          true,
      osNumber:          true,
      routineTaskNumber: true,
    };

    // Índice direto no JSON — evita o bug das "últimas 200 OS" sem o token
    let exec = await prisma.checklistExecution.findFirst({
      where: {
        status: { not: 'CANCELLED' },
        metadata: { path: ['trackingToken'], equals: token },
      },
      select: selectExec,
    });

    if (!exec) {
      const execs = await prisma.checklistExecution.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: selectExec,
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      exec = execs.find(e => {
        const m = e.metadata;
        return m && typeof m === 'object' && m.trackingToken === token;
      }) || null;
    }

    if (!exec) {
      return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    }

    const meta = cloneExecMetadata(exec.metadata);

    // Check expiry
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (meta.trackingExpiredAt && new Date() > new Date(meta.trackingExpiredAt)) {
      return res.status(410).json({
        expired: true,
        message: 'Este link de rastreamento expirou.',
        endedAt: meta.trackingEndedAt,
      });
    }

    // Fetch technician profile (name + avatar)
    let techName   = exec.ownerEmail?.split('@')[0] || 'Técnico';
    let techAvatar = null;
    let techPhone  = null;
    try {
      const userRecord = await prisma.user.findFirst({
        where: { email: exec.ownerEmail },
        select: { name: true, avatarUrl: true },
      });
      if (userRecord) {
        techName   = userRecord.name  || techName;
        techAvatar = userRecord.avatarUrl || null;
        techPhone  = userRecord.phone || null;
      }
    } catch(e) { /* user table may not have phone col yet */ }

    // GPS: última amostra útil do técnico (esta OS ou eventos sem executionId), para não «prender» a um
    // ponto antigo só porque o HEARTBEAT recente veio sem amarrar à execução.
    let currentLat = null;
    let currentLng = null;
    let gpsAge     = null;
    try {
      /**
       * O app muitas vezes manda GPS em HEARTBEAT com `executionId` null e outras vezes amarra à OS.
       * Ordenar só por `serverTimestamp` e cortar em N linhas pode perder o ponto com `deviceTimestamp`
       * mais recente (upload em lote / relógio do aparelho). Ordenamos por COALESCE no Postgres.
       */
      const ownerNorm = String(exec.ownerEmail || '').trim();
      let ev = null;
      if (ownerNorm) {
        try {
          const rows = await prisma.$queryRaw(
            Prisma.sql`
              SELECT lat, lng, "serverTimestamp", "deviceTimestamp"
              FROM "TelemetryEvent"
              WHERE LOWER(TRIM("ownerEmail")) = LOWER(${ownerNorm})
                AND lat IS NOT NULL
                AND lng IS NOT NULL
                AND (
                  "executionId" = ${exec.id}
                  OR "executionId" IS NULL
                  OR TRIM(COALESCE("executionId", '')) = ''
                )
              ORDER BY COALESCE("deviceTimestamp", "serverTimestamp") DESC
              LIMIT 1
            `
          );
          if (Array.isArray(rows) && rows[0]) ev = rows[0];
        } catch (sqlErr) {
          console.warn('[TRACKING] GPS query raw falhou, fallback Prisma:', sqlErr?.message || sqlErr);
          const gpsSelect = { lat: true, lng: true, serverTimestamp: true, deviceTimestamp: true };
          const rows = await prisma.telemetryEvent.findMany({
            where: {
              ownerEmail: { equals: ownerNorm, mode: 'insensitive' },
              lat: { not: null },
              lng: { not: null },
              OR: [{ executionId: exec.id }, { executionId: null }, { executionId: '' }],
            },
            take: 250,
            orderBy: { serverTimestamp: 'desc' },
            select: gpsSelect,
          });
          if (rows.length) {
            const sampleMs = (e) => new Date(e.deviceTimestamp || e.serverTimestamp).getTime();
            ev = rows.reduce((best, r) => (sampleMs(r) > sampleMs(best) ? r : best));
          }
        }
      }

      const ageSec = (e) =>
        e
          ? Math.round((Date.now() - new Date(e.deviceTimestamp || e.serverTimestamp).getTime()) / 1000)
          : null;

      if (ev) {
        currentLat = typeof ev.lat === 'number' ? ev.lat : parseFloat(ev.lat);
        currentLng = typeof ev.lng === 'number' ? ev.lng : parseFloat(ev.lng);
        if (!Number.isFinite(currentLat)) currentLat = null;
        if (!Number.isFinite(currentLng)) currentLng = null;
        if (currentLat != null && currentLng != null) {
          gpsAge = ageSec(ev);
        }
      }
    } catch (e) {}

    let isPausedFlag = isTrackingPaused(meta);
    /** Metadata ficou incoerente (ex.: retomou atendimento sem POST /tracking/resume): lastResumedAt > trackingPausedAt. */
    if (isPausedFlag && String(exec.status || '').toUpperCase() === 'IN_PROGRESS') {
      const ep = meta.executionPaused;
      const formPaused =
        ep === true || ep === 1 || ep === 'true' || ep === '1' || String(ep ?? '').toLowerCase() === 'true';
      if (!formPaused) {
        const pauseMs = meta.trackingPausedAt ? new Date(meta.trackingPausedAt).getTime() : NaN;
        const resumeMs = meta.lastResumedAt ? new Date(meta.lastResumedAt).getTime() : NaN;
        if (Number.isFinite(resumeMs) && Number.isFinite(pauseMs) && resumeMs > pauseMs) {
          isPausedFlag = false;
        }
      }
    }
    const isEnded = !!meta.trackingEndedAt;
    const trackingActive = !isEnded && !isPausedFlag;
    const freshGps =
      gpsAge != null && Number.isFinite(gpsAge) && gpsAge <= DISPLACEMENT_GPS_STALE_SEC;
    /** true = link ainda "aberto" mas não há GPS recente (técnico pode ter fechado o app). */
    const signalLost = trackingActive && !freshGps;

    // Polilinha do template (painel), até o cliente pedir rota nas ruas via /api/osrm/route-polyline
    let routePolyline = null;
    try {
      let poly = exec.locationPolygon;
      if (typeof poly === 'string') poly = JSON.parse(poly);
      if (Array.isArray(poly) && poly.length >= 2) {
        routePolyline = poly.map((pt) => {
          if (Array.isArray(pt) && pt.length >= 2) return [Number(pt[0]), Number(pt[1])];
          if (pt && pt.lat != null && pt.lng != null) return [Number(pt.lat), Number(pt.lng)];
          return null;
        }).filter((row) => row && row.every((n) => Number.isFinite(n)));
        if (routePolyline.length < 2) routePolyline = null;
      }
    } catch (_) {
      routePolyline = null;
    }

    let destLat = exec.locationLat != null ? Number(exec.locationLat) : null;
    let destLng = exec.locationLng != null ? Number(exec.locationLng) : null;
    if ((!Number.isFinite(destLat) || !Number.isFinite(destLng)) && exec.locationPolygon) {
      try {
        const poly =
          typeof exec.locationPolygon === 'string'
            ? JSON.parse(exec.locationPolygon)
            : exec.locationPolygon;
        if (Array.isArray(poly) && poly.length > 0) {
          // Rota/segmento: destino costuma ser o último vértice, não o primeiro
          const p = poly[poly.length - 1];
          const la = p?.[0] ?? p?.lat;
          const ln = p?.[1] ?? p?.lng;
          const nla = typeof la === 'number' ? la : parseFloat(String(la ?? '').replace(',', '.'));
          const nln = typeof ln === 'number' ? ln : parseFloat(String(ln ?? '').replace(',', '.'));
          if (Number.isFinite(nla) && Number.isFinite(nln)) {
            destLat = nla;
            destLng = nln;
          }
        }
      } catch (_) {}
    }

    const hasDestination = Number.isFinite(destLat) && Number.isFinite(destLng);

    return res.json({
      // Technician
      techName,
      techAvatar,
      techPhone,
      techEmail: exec.ownerEmail,

      // Current position
      currentLat,
      currentLng,
      gpsAgeSeconds: gpsAge,

      // Destination (fallback: primeiro vértice do polígono)
      destLat,
      destLng,
      destAddress: exec.locationAddress || meta.locationAddress || null,

      // Service info
      serviceTitle: meta.title || 'Atendimento Técnico',
      serviceDesc:  meta.description || null,
      zoneType:     exec.locationZoneType,
      /** Número convencional da FT (OS) ou da RT, para o link público de acompanhamento. */
      osNumber:          exec.osNumber != null && String(exec.osNumber).trim() ? String(exec.osNumber).trim() : null,
      routineTaskNumber:
        exec.routineTaskNumber != null && String(exec.routineTaskNumber).trim()
          ? String(exec.routineTaskNumber).trim()
          : null,

      // ETA (só faz sentido com destino geográfico; senão o cron OSRM não aplica e o cliente não deve ver «previsão»)
      etaMinutes: hasDestination ? exec.etaMinutes : null,

      // Route (for map polyline)
      routePolyline,

      // Status
      isEnded,
      isPaused:  isPausedFlag,
      signalLost,
      gpsStaleAfterSeconds: DISPLACEMENT_GPS_STALE_SEC,
      endedAt:   meta.trackingEndedAt    || null,
      startedAt: meta.trackingStartedAt  || null,
      expiresAt: meta.trackingExpiredAt  || null,
    });
  } catch (err) {
    console.error('[TRACKING] GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
