'use strict';

const fs = require('fs');
const path = require('path');

/** NDJSON para debug Cursor (apenas se o ficheiro for gravável — típico: API Node na máquina de desenvolvimento). */
function appendAgentPushDebugLine(obj) {
  try {
    const logPath = path.join(__dirname, '../../../..', '.cursor', 'debug-63633b.log');
    fs.appendFileSync(
      logPath,
      `${JSON.stringify({
        sessionId: '63633b',
        timestamp: Date.now(),
        ...obj,
      })}\n`,
      'utf8'
    );
  } catch {
    /* produção / path inexistente */
  }
}

/**
 * Envio via Expo Push API (HTTPS).
 * No Android 8+, o channelId deve coincidir com o criado no app (notifications.ts):
 * brspark-alerts (geral), brspark-tecnico (OS / prestador), brspark-cliente (deslocamento).
 */
/** API actual da Expo (CDN); `exp.host` redireciona mas costuma ser mais lento em lote. */
const EXPO_PUSH_URL = 'https://api.expo.dev/v2/push/send';

const ANDROID_CHANNEL_ID = 'brspark-alerts';
const MAX_MESSAGES_PER_REQUEST = 100;

async function sendExpoPush(to, payload) {
  const body = {
    to,
    sound: 'default',
    channelId: ANDROID_CHANNEL_ID,
    priority: 'high',
    ...payload,
  };

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let json = {};
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    console.error('[ExpoPush] HTTP', res.status, JSON.stringify(json).slice(0, 500));
    return { ok: false, json };
  }

  const d = json.data;
  if (d && d.status === 'error') {
    console.error('[ExpoPush] ticket error:', d.message, d.details || '');
    return { ok: false, json };
  }

  return { ok: true, json };
}

/**
 * Envia em lote (recomendado pela Expo) — um POST com até 100 mensagens.
 * @param {Array<{ token: string }|string>} entries
 * @param {{ title?: string, body?: string, data?: object }} payload
 * @returns {Promise<{ ok: boolean, sent: number, errors: number, tickets: object[] }>}
 */
async function sendExpoPushToMany(entries, payload) {
  const tokens = [];
  for (const entry of entries) {
    const to = typeof entry === 'string' ? entry : entry?.token;
    if (to && typeof to === 'string') tokens.push(to);
  }

  if (tokens.length === 0) {
    return { ok: true, sent: 0, errors: 0, tickets: [] };
  }

  const baseMsg = {
    sound: 'default',
    channelId: ANDROID_CHANNEL_ID,
    priority: 'high',
    ...payload,
  };

  let sent = 0;
  let errors = 0;
  const tickets = [];

  for (let i = 0; i < tokens.length; i += MAX_MESSAGES_PER_REQUEST) {
    const chunk = tokens.slice(i, i + MAX_MESSAGES_PER_REQUEST);
    const messages = chunk.map((to) => ({ to, ...baseMsg }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    let json = {};
    try {
      json = await res.json();
    } catch (e) {
      console.error('[ExpoPush] Resposta não-JSON:', e?.message || e);
      errors += chunk.length;
      continue;
    }

    if (!res.ok) {
      console.error('[ExpoPush] HTTP', res.status, JSON.stringify(json).slice(0, 800));
      errors += chunk.length;
      continue;
    }

    const raw = json.data;
    const batchTickets = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    tickets.push(...batchTickets);

    for (const t of batchTickets) {
      if (!t || typeof t !== 'object') continue;
      if (t.status === 'error') {
        errors++;
        console.error('[ExpoPush] ticket error:', t.message, JSON.stringify(t.details || '').slice(0, 300));
        // #region agent log
        appendAgentPushDebugLine({
          hypothesisId: 'H4',
          location: 'expoPush.js:sendExpoPushToMany',
          message: 'expo_ticket_error',
          data: {
            ticketMessage: String(t.message || '').slice(0, 200),
            detailsSnippet: JSON.stringify(t.details || '').slice(0, 200),
          },
        });
        // #endregion
      } else if (t.status === 'ok') {
        sent++;
      }
    }
  }

  // #region agent log
  appendAgentPushDebugLine({
    hypothesisId: 'H1',
    location: 'expoPush.js:sendExpoPushToMany',
    message: 'expo_push_batch_summary',
    data: {
      tokenCount: tokens.length,
      sent,
      errors,
      titleLen: typeof payload?.title === 'string' ? payload.title.length : 0,
      bodyLen: typeof payload?.body === 'string' ? payload.body.length : 0,
      channelId: payload?.channelId ?? baseMsg?.channelId ?? null,
      hasData: !!(payload && payload.data && typeof payload.data === 'object'),
    },
  });
  // #endregion

  return { ok: errors === 0, sent, errors, tickets };
}

module.exports = {
  sendExpoPush,
  sendExpoPushToMany,
  ANDROID_CHANNEL_ID,
};
