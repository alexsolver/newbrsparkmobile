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
const { sendClientTrackingLinkEmail } = require('../lib/clientTrackingLinkEmail');
const { sendTrackingClientChatPushToTechnician } = require('../lib/trackingClientChatPush');
const authUser = require('../middleware/authUser');
const { COPY } = require('../lib/trackingChatModerationPolicy');
const { pointsDeltaForSeverity, THRESHOLD_ALERT } = require('../lib/trackingChatModerationEngine');
const { runModerationPipeline, persistModerationEvent, getModState } = require('../lib/trackingChatPipeline');
const {
  translateChatText,
  normalizeChatLocale,
  parseTranslationsJson,
  chatTranslationEnabled,
} = require('../lib/chatTranslation');
const { normalizeBaseUrl } = require('../lib/evaluationSurveyUrl');
const {
  ensureHttpsUrlForPublicInternet,
  isPrivateOrLocalHost,
} = require('../lib/publicHttpsUrl');
const {
  stripTransitEtaDisplayFields,
  resolveDisplayEtaMinutesFromMeta,
} = require('../lib/transitEtaDisplaySnapshot');

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

/**
 * Origem pública para `track.html` (e-mail e push). Sem env → Host do pedido (atenção a proxies).
 * Preferir TRACKING_PUBLIC_BASE_URL ou PUBLIC_API_BASE em produção.
 */
function buildPublicTrackingUrl(req, trackingToken) {
  const tt = String(trackingToken || '').trim();
  if (!tt) return '';
  const path = `/track.html?t=${encodeURIComponent(tt)}`;
  const candidates = [
    process.env.TRACKING_PUBLIC_BASE_URL,
    process.env.PUBLIC_API_BASE,
    process.env.API_BASE_URL,
    process.env.ADMIN_PANEL_PUBLIC_BASE_URL,
    process.env.PUBLIC_PANEL_URL,
    process.env.ADMIN_PANEL_PUBLIC_URL,
  ];
  for (const raw of candidates) {
    const n = normalizeBaseUrl(raw);
    if (n) return ensureHttpsUrlForPublicInternet(`${n}${path}`);
  }
  const xf = String(req.get('x-forwarded-proto') || '')
    .split(',')[0]
    .trim();
  const host =
    req.get('host') || `127.0.0.1:${String(process.env.PORT || '3001').trim() || '3001'}`;
  const hostOnly = String(host).split(':')[0] || '';
  let proto = xf === 'https' ? 'https' : xf === 'http' ? 'http' : req.protocol || 'http';
  if (proto === 'http' && hostOnly && !isPrivateOrLocalHost(hostOnly)) {
    proto = 'https';
  }
  return ensureHttpsUrlForPublicInternet(`${proto}://${host}${path}`);
}

async function notifyClientTrackingStart(executionId, trackingUrl) {
  sendClientProviderEnRoutePush({ executionId, trackingUrl }).catch((e) =>
    console.warn('[TRACKING] push cliente (en route):', e?.message || e)
  );
  try {
    const r = await sendClientTrackingLinkEmail({ executionId, trackingUrl });
    if (r.ok) return;
    if (r.skipped === 'already_sent') return;
    if (r.skipped === 'no_client_email') {
      console.warn(
        `[TRACKING] e-mail acompanhamento omitido: metadata da OS sem e-mail do cliente (ex.: clientEmail no despacho). executionId=${executionId}`
      );
      return;
    }
    console.warn(
      `[TRACKING] e-mail acompanhamento ao cliente falhou. executionId=${executionId} detalhe=${r.skipped || 'n/a'} provider=${r.provider || 'n/a'}`
    );
  } catch (e) {
    console.warn('[TRACKING] e-mail acompanhamento exceção:', e?.message || e);
  }
}

const TRACKING_CHAT_KEY = 'trackingChatMessages';
const MAX_TRACKING_CHAT_MESSAGES = 120;
const MAX_TRACKING_CHAT_TEXT = 900;

function sameOwnerEmail(execEmail, jwtEmail) {
  if (!execEmail || !jwtEmail) return false;
  return String(execEmail).trim().toLowerCase() === String(jwtEmail).trim().toLowerCase();
}

function normalizeChatMessages(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      arr = JSON.parse(s);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const m of arr) {
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
    const trIn = m.translations;
    if (trIn != null && typeof trIn === 'object' && !Array.isArray(trIn)) {
      const parsed = parseTranslationsJson(trIn);
      if (Object.keys(parsed).length) row.translations = parsed;
    }
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

/** ID fixo: execuções antigas sem banner gravado recebem um virtual em cada GET; id aleatório quebrava keys do FlatList no app a cada poll. */
const TRACKING_CONDUCT_BANNER_ID = 'brspark_tracking_conduct_banner_v1';

function conductBannerMessage() {
  return {
    id: TRACKING_CONDUCT_BANNER_ID,
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
  /** Índice JSON no Postgres costuma bastar; SQL direto cobre edge cases em que o filtro Prisma falha ou há muitas OS ativas. */
  try {
    const rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT id FROM "ChecklistExecution"
        WHERE status <> 'CANCELLED'
          AND metadata IS NOT NULL
          AND metadata->>'trackingToken' = ${token}
        LIMIT 1
      `
    );
    if (Array.isArray(rows) && rows[0] && rows[0].id) {
      const byId = await prisma.checklistExecution.findUnique({
        where: { id: String(rows[0].id) },
        select: selectExecForToken,
      });
      if (byId) return byId;
    }
  } catch (e) {
    console.warn('[TRACKING] findExecutionByTrackingToken SQL:', e?.message || e);
  }

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
      take: 4000,
    });
    exec =
      execs.find((e) => {
        const m = cloneExecMetadata(e.metadata);
        return m.trackingToken === token;
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
 * Técnico: `preferredChatLocale` ou idioma padrão do tenant. Cliente (link): `?chatLocale=` ou cabeçalho `X-Chat-Locale`.
 * @param {import('express').Request} req
 * @param {'tech'|'client'} viewerRole
 */
async function resolveTrackingLocaleFromRequest(req, viewerRole) {
  if (viewerRole === 'tech') {
    const u = req.user;
    if (!u?.id) return 'pt-BR';
    const meRow = await prisma.user.findUnique({
      where: { id: u.id },
      select: { preferredChatLocale: true, tenantId: true },
    });
    if (meRow?.preferredChatLocale && String(meRow.preferredChatLocale).trim()) {
      return normalizeChatLocale(meRow.preferredChatLocale);
    }
    if (!meRow?.tenantId) return 'pt-BR';
    const tenant = await prisma.tenant.findUnique({
      where: { id: meRow.tenantId },
      select: { defaultLang: true },
    });
    return normalizeChatLocale(tenant?.defaultLang || 'pt-BR');
  }
  const raw = String(req.query?.chatLocale || req.headers['x-chat-locale'] || '').trim();
  if (!raw) return 'pt-BR';
  return normalizeChatLocale(raw);
}

/**
 * Texto a mostrar (`displayText`) por mensagem; persiste cache `translations` no metadata (como no chat interno).
 * @param {string|null} execId
 * @param {Array<object>} messages
 * @param {'tech'|'client'} viewerRole
 * @param {string} resolvedLocale
 */
async function applyTrackingDisplayTranslations(execId, messages, viewerRole, resolvedLocale) {
  const locale = normalizeChatLocale(resolvedLocale);
  const out = [];
  if (!chatTranslationEnabled()) {
    for (const m of messages) {
      const { translations: _x, ...rest } = m;
      out.push({ ...rest, displayText: m.text });
    }
    return out;
  }

  /** @type {Map<string, Record<string, string>>} */
  const persistById = new Map();
  for (const m of messages) {
    const { translations: _tr, ...rest } = m;
    let displayText = m.text;
    if (m.role === viewerRole) {
      displayText = m.text;
    } else {
      const trans = parseTranslationsJson(m.translations);
      if (trans[locale]) {
        displayText = trans[locale];
      } else {
        const rawText = m.text != null ? String(m.text) : '';
        if (rawText.trim()) {
          const t = await translateChatText(rawText, locale);
          if (t) {
            displayText = t;
            persistById.set(m.id, { ...trans, [locale]: t });
          }
        }
      }
    }
    out.push({ ...rest, displayText });
  }

  if (persistById.size > 0 && execId) {
    try {
      await mergeChatMetadata(execId, (meta) => {
        let list = normalizeChatMessages(meta[TRACKING_CHAT_KEY]);
        for (const [msgId, mergedTrans] of persistById) {
          const idx = list.findIndex((x) => x.id === msgId);
          if (idx >= 0) {
            const prev = parseTranslationsJson(list[idx].translations);
            const merged = { ...prev, ...mergedTrans };
            list[idx] = { ...list[idx], translations: merged };
          }
        }
        meta[TRACKING_CHAT_KEY] = list;
      });
    } catch (e) {
      console.warn('[TRACKING] falha ao persistir traduções no chat:', e?.message || e);
    }
  }

  return out;
}

/**
 * @param {import('express').Response} res
 * @param {{ req: import('express').Request, exec: any, textIn: string, actorRole: 'client'|'tech', techSenderLabel?: string|null }} opts
 */
async function processModeratedChatPost(res, opts) {
  const { req, exec, textIn, actorRole, techSenderLabel } = opts;
  const viewerLocale = await resolveTrackingLocaleFromRequest(req, actorRole);
  const forceSend = readForceSend(req);
  const meta0 = cloneExecMetadata(exec.metadata);
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
    const enriched = await applyTrackingDisplayTranslations(exec.id, messages, actorRole, viewerLocale);
    if (actorRole === 'client') {
      void sendTrackingClientChatPushToTechnician(prisma, {
        executionId: exec.id,
        ownerEmail: exec.ownerEmail,
        templateTenantId: tenantId,
        messagePreview: textIn,
      }).catch((e) => console.warn('[TRACKING] push chat cliente:', e?.message || e));
    }
    return res.json({ ok: true, messages: enriched });
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
    const enriched422 = await applyTrackingDisplayTranslations(exec.id, messages, actorRole, viewerLocale);
    return res.status(422).json({
      ok: false,
      code: 'CHAT_MODERATION',
      decision: finalAction,
      severity: pipe.sig.severity,
      category: pipe.sig.category,
      userMessage: userMessage || COPY.requestRewrite,
      canOverride: !!canOverride && finalAction === 'request_rewrite',
      messages: enriched422,
    });
  }

  console.error('[TRACKING] moderação: ação inesperada', pipe.decision?.finalAction);
  return res.status(500).json({ error: 'Falha interna na moderação do chat.' });
}

// ─── POST /api/tracking/start/:taskId ────────────────────────────────────────
// Called by mobile app when technician presses "Iniciar Deslocamento".
// Creates a unique public token linked to this execution.
router.post('/start/:taskId', authUser, async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para iniciar o rastreamento desta OS.' });
    }

    // Idempotent: reuse existing token if already started
    const existingToken = cloneExecMetadata(exec.metadata).trackingToken;
    if (existingToken) {
      const url = buildPublicTrackingUrl(req, existingToken);
      await notifyClientTrackingStart(taskId, url);
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

    const url = buildPublicTrackingUrl(req, token);
    console.log(`[TRACKING] ✅ Token criado para ${taskId}: ${token}`);
    await notifyClientTrackingStart(taskId, url);
    res.json({ token, url });
  } catch (err) {
    console.error('[TRACKING] start error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/tracking/end/:taskId ──────────────────────────────────────────
// Called by mobile app when technician finishes transit.
// Expira o link público após TRACKING_GRACE_AFTER_END_MS (padrão 30 min).
router.post('/end/:taskId', authUser, async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para encerrar o rastreamento desta OS.' });
    }

    const meta = cloneExecMetadata(exec.metadata);
    const expiry = new Date(Date.now() + TRACKING_GRACE_AFTER_END_MS);

    stripTransitEtaDisplayFields(meta);
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
router.post('/pause/:taskId', authUser, async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para pausar o rastreamento desta OS.' });
    }
    const meta = cloneExecMetadata(exec.metadata);
    meta.trackingPaused = true;
    meta.trackingPausedAt = new Date().toISOString();
    stripTransitEtaDisplayFields(meta);
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
router.post('/resume/:taskId', authUser, async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: taskId } });
    if (!exec) return res.status(404).json({ error: 'OS não encontrada' });
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para retomar o rastreamento desta OS.' });
    }
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

function setTrackingChatCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Accept, Cache-Control, Pragma, X-Chat-Locale'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
}

router.options('/task/:taskId/chat', (_req, res) => {
  setTrackingChatCorsHeaders(res);
  res.sendStatus(204);
});

router.options('/:token/chat', (_req, res) => {
  setTrackingChatCorsHeaders(res);
  res.sendStatus(204);
});

router.get('/task/:taskId/chat', authUser, async (req, res) => {
  try {
    const { taskId } = req.params;
    const exec = await prisma.checklistExecution.findUnique({
      where: { id: taskId },
      select: { id: true, ownerEmail: true, metadata: true },
    });
    if (!exec) {
      return res.status(404).json({ error: 'OS não encontrada' });
    }
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para esta OS.' });
    }
    const meta = cloneExecMetadata(exec.metadata);
    if (!trackingChatAllowed(meta)) {
      return res.status(400).json({ error: 'Chat indisponível (link expirado ou deslocamento não iniciado).' });
    }
    const baseMsgs = chatMessagesForApiResponse(meta);
    const locTech = await resolveTrackingLocaleFromRequest(req, 'tech');
    const messages = await applyTrackingDisplayTranslations(exec.id, baseMsgs, 'tech', locTech);
    res.json({ messages });
  } catch (err) {
    console.error('[TRACKING] chat GET (task) error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post(
  '/task/:taskId/chat',
  authUser,
  async (req, res) => {
  try {
    const { taskId } = req.params;
    const textIn = readChatTextFromBody(req);
    if (!textIn) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const exec = await prisma.checklistExecution.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        ownerEmail: true,
        metadata: true,
        template: { select: { tenantId: true, tenant: { select: { features: true } } } },
      },
    });
    if (!exec) {
      return res.status(404).json({ error: 'OS não encontrada' });
    }
    if (!sameOwnerEmail(exec.ownerEmail, req.user.email)) {
      return res.status(403).json({ error: 'Sem permissão para esta OS.' });
    }
    const meta = cloneExecMetadata(exec.metadata);
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
  }
);

router.get('/:token/chat', async (req, res) => {
  try {
    const { token } = req.params;
    const exec = await findExecutionByTrackingToken(token);
    if (!exec) {
      return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    }
    const meta = cloneExecMetadata(exec.metadata);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    if (isTrackingChatExpired(meta)) {
      return res.status(410).json({ expired: true, error: 'Este link de rastreamento expirou.' });
    }
    if (!trackingChatAllowed(meta)) {
      return res.status(400).json({ error: 'Chat indisponível (link expirado ou deslocamento não iniciado).' });
    }
    const baseTok = chatMessagesForApiResponse(meta);
    const locClient = await resolveTrackingLocaleFromRequest(req, 'client');
    const messages = await applyTrackingDisplayTranslations(exec.id, baseTok, 'client', locClient);
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
    if (!textIn) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const exec = await findExecutionByTokenForChat(token);
    if (!exec) {
      return res.status(404).json({ error: 'Link inválido ou não encontrado.' });
    }
    const meta = cloneExecMetadata(exec.metadata);
    res.setHeader('Cache-Control', 'no-store');
    if (isTrackingChatExpired(meta)) {
      return res.status(410).json({ expired: true, error: 'Este link de rastreamento expirou.' });
    }
    const urlTok = String(token || '').trim();
    const metaTok = String(meta.trackingToken || '').trim();
    if (!metaTok || metaTok !== urlTok) {
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
        techAvatar = ensureHttpsUrlForPublicInternet(userRecord.avatarUrl) || null;
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

    const useDisplaySnapshot =
      hasDestination && trackingActive && !isPausedFlag && !signalLost;
    const etaFromTechSnapshot = useDisplaySnapshot
      ? resolveDisplayEtaMinutesFromMeta(meta, Date.now())
      : null;
    const etaMinutesOut =
      etaFromTechSnapshot != null ? etaFromTechSnapshot : hasDestination ? exec.etaMinutes : null;

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

      // ETA: mesmo snapshot + relógio do mapa do técnico quando disponível; senão coluna `etaMinutes` (OSRM/servidor).
      etaMinutes: etaMinutesOut,

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
