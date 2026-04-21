'use strict';

const TWILIO_INTEGRATION_NAME = 'Twilio';

/**
 * Credenciais Twilio: integração «Twilio» (PUSH) na BD; senão variáveis TWILIO_* no ambiente.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{
 *   accountSid: string,
 *   authToken: string,
 *   smsFrom: string,
 *   whatsappFrom: string,
 *   source: 'integration'|'env'|'none'
 * }>}
 */
async function resolveTwilioCredentials(prisma) {
  const envSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const envToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const envSms = String(process.env.TWILIO_SMS_FROM || process.env.TWILIO_PHONE_NUMBER || '').trim();
  const envWa = String(process.env.TWILIO_WHATSAPP_FROM || '').trim();

  let row = null;
  try {
    row = await prisma.integration.findFirst({
      where: { name: TWILIO_INTEGRATION_NAME, type: 'PUSH' },
    });
  } catch {
    row = null;
  }

  const meta =
    row && row.metadata && typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
  const sidFromMeta = meta.accountSid != null ? String(meta.accountSid).trim() : '';
  const smsFromMeta = meta.smsFrom != null ? String(meta.smsFrom).trim() : '';
  const waFromMeta = meta.whatsappFrom != null ? String(meta.whatsappFrom).trim() : '';
  const tokenFromRow = row && row.apiKey != null ? String(row.apiKey).trim() : '';

  if (sidFromMeta && tokenFromRow) {
    return {
      accountSid: sidFromMeta,
      authToken: tokenFromRow,
      smsFrom: smsFromMeta || envSms,
      whatsappFrom: waFromMeta || envWa,
      source: 'integration',
    };
  }

  if (envSid && envToken) {
    return {
      accountSid: envSid,
      authToken: envToken,
      smsFrom: envSms,
      whatsappFrom: envWa,
      source: 'env',
    };
  }

  return {
    accountSid: '',
    authToken: '',
    smsFrom: '',
    whatsappFrom: '',
    source: 'none',
  };
}

module.exports = {
  TWILIO_INTEGRATION_NAME,
  resolveTwilioCredentials,
};
