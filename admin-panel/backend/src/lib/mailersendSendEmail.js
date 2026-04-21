'use strict';

const { normalizeTo } = require('./nylasSendEmail');
const { resolveMailerSendConfig } = require('./mailersendCredentials');

/**
 * Envia e-mail transacional via MailerSend (`POST /v1/email`).
 *
 * Credenciais: integração «MailerSend» no painel e/ou MAILERSEND_API_TOKEN + MAILERSEND_FROM_EMAIL (domínio verificado).
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
  const cfg = await resolveMailerSendConfig();
  const token = cfg.token;
  const fromEmail = cfg.fromEmail;
  const fromName = cfg.fromName;

  if (!token || !fromEmail) {
    return {
      ok: false,
      skipped: true,
      reason:
        'MailerSend sem token ou remetente. Configure Integrações → MailerSend (API token) e defina MAILERSEND_FROM_EMAIL no servidor (domínio verificado), ou MAILERSEND_API_TOKEN + MAILERSEND_FROM_EMAIL no .env.',
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

  const rawBase = String(cfg.baseUrl || '').trim().replace(/\/+$/, '');
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
