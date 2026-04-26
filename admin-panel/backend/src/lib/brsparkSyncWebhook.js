'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { randomUUID } = require('crypto');

const EVENT_TYPES = {
  USER_CREATED: 'user.created',
  USER_PHONE_VERIFIED: 'user.phone_verified',
  KYC_STATUS_CHANGED: 'kyc.status_changed',
  ONBOARDING_SUBMITTED: 'onboarding.submitted',
  CHECKLIST_EXECUTION_COMPLETED: 'checklist.execution.completed',
};

function signRequest(secret, timestamp, body) {
  const s = String(secret);
  if (!s) return null;
  const str = String(timestamp) + '.' + String(body);
  return 'v1=' + crypto.createHmac('sha256', s).update(str, 'utf8').digest('hex');
}

/**
 * @param {object} opts
 * @param {string} opts.type
 * @param {object} opts.payload
 * @param {string} [opts.id]
 * @param {string} [opts.idempotencyKey]
 */
function deliverBrsparkLaravelEvent(opts) {
  const { type, payload, id, idempotencyKey } = opts;
  const base = String(
    process.env.BRSPARK_LARAVEL_BASE_URL || process.env.LARAVEL_BRSPARK_SYNC_BASE_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');
  const path = String(process.env.BRSPARK_LARAVEL_WEBHOOK_PATH || '/api/internal/brspark/events');
  const fullUrl = base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : '';
  const secret = String(process.env.BRSPARK_WEBHOOK_SECRET || '').trim();
  const token = String(process.env.CMS_INTERNAL_API_TOKEN || process.env.BRSPARK_LARAVEL_BEARER || '').trim();
  if (!fullUrl || !secret || !token) {
    return Promise.resolve({ skipped: true, reason: !fullUrl ? 'no_laravel_url' : !secret ? 'no_webhook_secret' : 'no_bearer' });
  }

  const body = JSON.stringify({
    type: String(type),
    id: id || randomUUID(),
    occurredAt: new Date().toISOString(),
    payload: payload && typeof payload === 'object' ? payload : {},
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = signRequest(secret, ts, body);
  if (!sig) {
    return Promise.resolve({ skipped: true, reason: 'sign_failed' });
  }
  const idemp = idempotencyKey || `${type}-${(id || '').slice(0, 8)}-${ts}`;

  const u = new URL(fullUrl);
  const isHttps = u.protocol === 'https:';
  const mod = isHttps ? https : http;
  const port = u.port
    ? Number(u.port)
    : isHttps
    ? 443
    : 80;

  return new Promise((resolve) => {
    const req = mod.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body, 'utf8'),
          Authorization: `Bearer ${token}`,
          'X-Brspark-Timestamp': ts,
          'X-Brspark-Signature': sig,
          'X-Idempotency-Key': idemp,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            let j;
            try {
              j = JSON.parse(txt);
            } catch {
              j = { raw: txt };
            }
            resolve({ ok: true, status: res.statusCode, body: j });
          } else {
            console.warn('[brsparkSyncWebhook] falha', res.statusCode, txt?.slice(0, 240));
            resolve({ ok: false, status: res.statusCode, body: txt });
          }
        });
      }
    );
    req.on('error', (e) => {
      console.warn('[brsparkSyncWebhook] rede', e?.message);
      resolve({ ok: false, error: e?.message });
    });
    req.write(body, 'utf8');
    req.end();
  });
}

module.exports = {
  deliverBrsparkLaravelEvent,
  signRequest,
  EVENT_TYPES,
};
