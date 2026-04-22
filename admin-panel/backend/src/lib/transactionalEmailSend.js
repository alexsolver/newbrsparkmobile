'use strict';

const { sendEmailViaNylas } = require('./nylasSendEmail');
const { sendEmailViaMailerSend } = require('./mailersendSendEmail');

/**
 * E-mail transacional: tenta MailerSend (MAILERSEND_API_TOKEN + MAILERSEND_FROM_EMAIL);
 * se não configurado, tenta Nylas. Se MailerSend estiver configurado e falhar, não faz fallback.
 *
 * @param {object} opts — mesmo contrato que `sendEmailViaNylas` / `sendEmailViaMailerSend`
 * @returns {Promise<{ send: object, provider: 'mailersend'|'nylas'|'none' }>}
 */
async function sendTransactionalEmailWithFallback(opts) {
  const ms = await sendEmailViaMailerSend(opts);
  if (ms.ok) return { send: ms, provider: 'mailersend' };
  if (!ms.skipped) return { send: ms, provider: 'mailersend' };
  const ny = await sendEmailViaNylas(opts);
  if (ny.ok) return { send: ny, provider: 'nylas' };
  return { send: ny, provider: ny.skipped ? 'none' : 'nylas' };
}

/**
 * Códigos OTP e e-mails equivalentes: por omissão **Nylas primeiro**, depois MailerSend.
 *
 * `OTP_EMAIL_PROVIDER` (opcional):
 * - `nylas` (omissão) — Nylas → MailerSend
 * - `mailersend` — MailerSend → Nylas
 * - `legacy` — mesmo que o resto da app (`sendTransactionalEmailWithFallback`: MailerSend → Nylas)
 *
 * @param {object} opts — mesmo contrato que `sendEmailViaNylas` / `sendEmailViaMailerSend`
 * @returns {Promise<{ send: object, provider: 'mailersend'|'nylas'|'none' }>}
 */
async function sendOtpTransactionalEmail(opts) {
  const mode = String(process.env.OTP_EMAIL_PROVIDER || 'nylas').toLowerCase();
  if (mode === 'legacy') {
    return sendTransactionalEmailWithFallback(opts);
  }
  if (mode === 'mailersend') {
    const ms = await sendEmailViaMailerSend(opts);
    if (ms.ok) return { send: ms, provider: 'mailersend' };
    if (!ms.skipped) return { send: ms, provider: 'mailersend' };
    const ny = await sendEmailViaNylas(opts);
    if (ny.ok) return { send: ny, provider: 'nylas' };
    return { send: ny, provider: ny.skipped ? 'none' : 'nylas' };
  }
  const ny = await sendEmailViaNylas(opts);
  if (ny.ok) return { send: ny, provider: 'nylas' };
  if (!ny.skipped) return { send: ny, provider: 'nylas' };
  const ms = await sendEmailViaMailerSend(opts);
  if (ms.ok) return { send: ms, provider: 'mailersend' };
  return { send: ms, provider: ms.skipped ? 'none' : 'mailersend' };
}

module.exports = { sendTransactionalEmailWithFallback, sendOtpTransactionalEmail };
