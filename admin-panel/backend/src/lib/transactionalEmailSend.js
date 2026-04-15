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

module.exports = { sendTransactionalEmailWithFallback };
