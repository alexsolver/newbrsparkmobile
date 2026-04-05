'use strict';

/**
 * Envio via Expo Push API (HTTPS).
 * No Android 8+, o channelId deve coincidir com o criado no app (notifications.ts → brspark-alerts).
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const ANDROID_CHANNEL_ID = 'brspark-alerts';

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
 * @param {Array<{ token: string }|string>} entries
 * @param {{ title?: string, body?: string, data?: object }} payload
 */
async function sendExpoPushToMany(entries, payload) {
  const results = [];
  for (const entry of entries) {
    const to = typeof entry === 'string' ? entry : entry?.token;
    if (!to || typeof to !== 'string') continue;
    results.push(await sendExpoPush(to, payload));
  }
  return results;
}

module.exports = {
  sendExpoPush,
  sendExpoPushToMany,
  ANDROID_CHANNEL_ID,
};
