'use strict';

const { normalizeTo } = require('./nylasSendEmail');

const DEFAULT_API_BASE = 'https://api.mailersend.com/v1';

/**
 * Envia e-mail transacional via MailerSend (`POST /v1/email`).
 *
 * Requer token de API e remetente num domínio verificado no MailerSend.
 *
 * @param {object} opts
 * @param {string|string[]|{ email: string, name?: string }} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.text]
 * @param {string} [opts.html]
 * @param {string|string[]|{ email: string, name?: string }} [opts.replyTo]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string, status?: number, data?: unknown }>}
 */
async function sendEmailViaMailerSend(opts) {
  const { to, subject, text, html, replyTo } = opts || {};
  const token = String(process.env.MAILERSEND_API_TOKEN || '').trim();
  const fromEmail = String(process.env.MAILERSEND_FROM_EMAIL || '').trim();
  const fromName = String(
    process.env.MAILERSEND_FROM_NAME || process.env.MAILERSEND_FROM || 'BrSpark',
  ).trim() || 'BrSpark';

  if (!token || !fromEmail) {
    return {
      ok: false,
      skipped: true,
      reason:
        'MailerSend sem token ou remetente. Defina MAILERSEND_API_TOKEN e MAILERSEND_FROM_EMAIL no servidor (domínio verificado no MailerSend).',
    };
  }

  const toList = normalizeTo(to);
  if (!toList.length) {
    return { ok: false, skipped: false, error: 'Destinatário (to) inválido.' };
  }

  const htmlStr = html && String(html).trim() ? String(html) : '';
  const textStr =
    text != null && String(text).trim() ? String(text).replace(/\r\n/g, '\n') : '';
  if (!htmlStr && !textStr) {
    return { ok: false, skipped: false, error: 'Corpo do e-mail vazio (html ou text).' };
  }

  const rawBase = String(process.env.MAILERSEND_API_BASE || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  const base = /\/v1$/i.test(rawBase) ? rawBase : `${rawBase}/v1`;
  const url = `${base}/email`;

  const body = {
    from: { email: fromEmail, name: fromName },
    to: toList,
    subject: String(subject || '').slice(0, 998),
    ...(htmlStr ? { html: htmlStr } : {}),
    ...(textStr ? { text: textStr } : {}),
  };

  if (replyTo) {
    const rt = normalizeTo(replyTo);
    if (rt.length) body.reply_to = rt;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (res.ok || res.status === 200 || res.status === 201 || res.status === 202) {
      return { ok: true, skipped: false, status: res.status, data };
    }

    const msg =
      (data && (data.message || data.errors?.[0]?.message)) ||
      `HTTP ${res.status}: ${String(raw).slice(0, 240)}`;

    return { ok: false, skipped: false, error: String(msg), status: res.status, data };
  } catch (e) {
    return { ok: false, skipped: false, error: e.message || String(e) };
  }
}

module.exports = { sendEmailViaMailerSend };
