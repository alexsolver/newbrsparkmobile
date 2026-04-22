'use strict';

const { sendEmailViaNylas } = require('./nylasSendEmail');
const { sendEmailViaMailerSend } = require('./mailersendSendEmail');
const { sendEmailViaMicrosoftGraph } = require('./microsoftGraphSendEmail');

/**
 * E-mail transacional (redefinição de senha, verificação de conta, convites, avaliações, etc.):
 * 1. **Microsoft Graph** (integração ou MICROSOFT_GRAPH_*) — se configurado e falhar, não faz fallback.
 * 2. MailerSend → 3. Nylas (se Graph não estiver configurado).
 *
 * @param {object} opts — mesmo contrato que `sendEmailViaNylas` / `sendEmailViaMailerSend` / Graph
 * @returns {Promise<{ send: object, provider: 'microsoft_graph'|'mailersend'|'nylas'|'none' }>}
 */
async function sendTransactionalEmailWithFallback(opts) {
  const mg = await sendEmailViaMicrosoftGraph(opts);
  if (mg.ok) return { send: mg, provider: 'microsoft_graph' };
  if (!mg.skipped) return { send: mg, provider: 'microsoft_graph' };

  const ms = await sendEmailViaMailerSend(opts);
  if (ms.ok) return { send: ms, provider: 'mailersend' };
  if (!ms.skipped) return { send: ms, provider: 'mailersend' };
  const ny = await sendEmailViaNylas(opts);
  if (ny.ok) return { send: ny, provider: 'nylas' };
  return { send: ny, provider: ny.skipped ? 'none' : 'nylas' };
}

/**
 * Códigos OTP e e-mails equivalentes:
 * 1. Se **Microsoft Graph** (integração ou MICROSOFT_GRAPH_*) estiver completo → envia só por Graph.
 * 2. Caso contrário, `OTP_EMAIL_PROVIDER`:
 * - `nylas` (omissão) — Nylas → MailerSend
 * - `mailersend` — MailerSend → Nylas
 * - `legacy` — mesmo que o resto da app (`sendTransactionalEmailWithFallback`: Graph → MailerSend → Nylas)
 *
 * @param {object} opts — mesmo contrato que `sendEmailViaNylas` / `sendEmailViaMailerSend`
 * @returns {Promise<{ send: object, provider: 'microsoft_graph'|'mailersend'|'nylas'|'none' }>}
 */
async function sendOtpTransactionalEmail(opts) {
  const mg = await sendEmailViaMicrosoftGraph(opts);
  if (mg.ok) return { send: mg, provider: 'microsoft_graph' };
  if (!mg.skipped) return { send: mg, provider: 'microsoft_graph' };

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
