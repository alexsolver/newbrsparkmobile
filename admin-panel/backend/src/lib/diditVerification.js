'use strict';

const crypto = require('crypto');

const DIDIT_API_BASE = String(process.env.DIDIT_API_BASE || 'https://verification.didit.me').replace(/\/+$/, '');

/**
 * @param {object} opts
 * @param {string} opts.workflowId
 * @param {string} opts.callbackUrl
 * @param {string} opts.vendorData
 * @param {Record<string, unknown>} [opts.metadata]
 * @param {string} [opts.email]
 */
async function diditCreateVerificationSession(opts) {
  const apiKey = String(process.env.DIDIT_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('DIDIT_API_KEY não configurada.');
    err.code = 'DIDIT_NOT_CONFIGURED';
    throw err;
  }
  const workflowId = String(opts.workflowId || '').trim();
  if (!workflowId) {
    const err = new Error('workflow_id Didit em falta.');
    err.code = 'DIDIT_WORKFLOW_MISSING';
    throw err;
  }
  const callback = String(opts.callbackUrl || '').trim();
  if (!callback) {
    const err = new Error('callback Didit em falta.');
    err.code = 'DIDIT_CALLBACK_MISSING';
    throw err;
  }

  const body = {
    workflow_id: workflowId,
    callback,
    vendor_data: String(opts.vendorData || '').trim() || undefined,
    metadata: opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : undefined,
    contact_details:
      opts.email && String(opts.email).trim()
        ? {
            email: String(opts.email).trim().toLowerCase(),
            send_notification_emails: false,
          }
        : undefined,
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  let res;
  try {
    res = await fetch(`${DIDIT_API_BASE}/v3/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : `Didit HTTP ${res.status}`,
    );
    err.code = 'DIDIT_API_ERROR';
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return {
    sessionId: data.session_id != null ? String(data.session_id) : '',
    sessionToken: data.session_token != null ? String(data.session_token) : '',
    verificationUrl: data.verification_url != null ? String(data.verification_url) : '',
    status: data.status != null ? String(data.status) : '',
    workflowId: data.workflow_id != null ? String(data.workflow_id) : workflowId,
    raw: data,
  };
}

/**
 * @param {string} sessionId
 */
async function diditGetSessionDecision(sessionId) {
  const apiKey = String(process.env.DIDIT_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error('DIDIT_API_KEY não configurada.');
    err.code = 'DIDIT_NOT_CONFIGURED';
    throw err;
  }
  const sid = String(sessionId || '').trim();
  if (!sid) {
    const err = new Error('session_id em falta.');
    err.code = 'DIDIT_SESSION_MISSING';
    throw err;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  let res;
  try {
    res = await fetch(`${DIDIT_API_BASE}/v3/session/${encodeURIComponent(sid)}/decision/`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Didit decision HTTP ${res.status}`);
    err.code = 'DIDIT_DECISION_ERROR';
    err.status = res.status;
    err.body = data;
    throw err;
  }

  const decisionStatus =
    data.decision && typeof data.decision === 'object' && data.decision.status != null
      ? String(data.decision.status)
      : data.status != null
        ? String(data.status)
        : '';
  return {
    sessionId: sid,
    status: data.status != null ? String(data.status) : '',
    decisionStatus,
    raw: data,
  };
}

/**
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHex
 * @param {string|undefined} timestampSec
 * @param {string} secret
 */
function verifyDiditWebhookSignature(rawBody, signatureHex, timestampSec, secret) {
  const sec = String(secret || '').trim();
  if (!sec || !Buffer.isBuffer(rawBody)) return false;

  const ts = timestampSec != null ? Number.parseInt(String(timestampSec), 10) : NaN;
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const sigIn = String(signatureHex || '').trim().toLowerCase().replace(/^0x/, '');
  if (!sigIn) return false;

  const expected = crypto.createHmac('sha256', sec).update(rawBody).digest('hex').toLowerCase();
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(sigIn, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = {
  diditCreateVerificationSession,
  diditGetSessionDecision,
  verifyDiditWebhookSignature,
  DIDIT_API_BASE,
};
