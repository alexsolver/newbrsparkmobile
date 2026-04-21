'use strict';

const { resolveNylasCredentials, normalizeNylasApiUri } = require('./nylasCredentials');

/**
 * @param {string|string[]|{ email: string, name?: string }|Array<{ email: string, name?: string }>} to
 * @returns {{ email: string, name?: string }[]}
 */
function normalizeTo(to) {
  if (!to) return [];
  if (Array.isArray(to)) {
    return to
      .map((x) => {
        if (typeof x === 'string' && x.trim()) return { email: x.trim() };
        if (x && typeof x === 'object' && x.email) {
          const email = String(x.email).trim();
          if (!email) return null;
          const o = { email };
          if (x.name && String(x.name).trim()) o.name = String(x.name).trim();
          return o;
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof to === 'string' && to.trim()) return [{ email: to.trim() }];
  if (to && typeof to === 'object' && to.email) {
    const email = String(to.email).trim();
    if (!email) return [];
    const o = { email };
    if (to.name && String(to.name).trim()) o.name = String(to.name).trim();
    return [o];
  }
  return [];
}

/**
 * Envia e-mail via Nylas API v3 (`POST /v3/grants/{grant_id}/messages/send`).
 *
 * Requer API Key da aplicação + Grant ID da conta de envio (OAuth ligada no dashboard Nylas).
 *
 * @param {object} opts
 * @param {string|string[]|{ email: string, name?: string }} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.text] — corpo texto (se não houver `html`)
 * @param {string} [opts.html] — corpo HTML (prioritário sobre `text` para o MIME)
 * @param {string|string[]|{ email: string, name?: string }} [opts.replyTo]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string, status?: number, data?: unknown }>}
 */
async function sendEmailViaNylas(opts) {
  const { to, subject, text, html, replyTo } = opts || {};
  const { apiKey, apiUri, grantId } = await resolveNylasCredentials();

  if (!apiKey || !grantId) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Nylas sem API Key ou Grant ID. Configure em Integrações → Nylas (Grant ID da conta de envio) ou defina NYLAS_API_KEY e NYLAS_GRANT_ID no servidor.',
    };
  }

  const toList = normalizeTo(to);
  if (!toList.length) {
    return { ok: false, skipped: false, error: 'Destinatário (to) inválido.' };
  }

  const useHtml = !!(html && String(html).trim());
  const bodyPayload = {
    subject: String(subject || '').slice(0, 998),
    to: toList,
    ...(useHtml
      ? { body: String(html), is_plaintext: false }
      : {
          body: String(text != null ? text : html != null ? html : '')
            .replace(/\r\n/g, '\n'),
          is_plaintext: true,
        }),
  };

  if (replyTo) {
    const rt = normalizeTo(replyTo);
    if (rt.length) bodyPayload.reply_to = rt;
  }

  const base = normalizeNylasApiUri(apiUri);
  const url = `${base}/v3/grants/${encodeURIComponent(grantId)}/messages/send`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }

    if (res.ok || res.status === 200 || res.status === 201 || res.status === 202) {
      return { ok: true, skipped: false, status: res.status, data };
    }

    let msg =
      (data && (data.message || data.error?.message)) ||
      (typeof data === 'object' && data.request_id ? `HTTP ${res.status}` : null) ||
      `HTTP ${res.status}: ${String(raw).slice(0, 240)}`;
    msg = String(msg);
    const rawScan = `${msg} ${String(raw || '')}`;
    const errType = data && data.error && typeof data.error === 'object' ? data.error.type : '';

    const nylasAuthHint =
      'API Key ou Grant da Nylas inválido ou revogado. Atualize em Integrações → Nylas (API Key + Grant ID) ou NYLAS_API_KEY / NYLAS_GRANT_ID no .env.';

    if (
      res.status === 401 ||
      errType === 'token.unauthorized_access' ||
      /bearer\s*token\s*invalid|invalid\s*credentials|unauthori[sz]ed/i.test(rawScan)
    ) {
      msg = nylasAuthHint;
    }

    return { ok: false, skipped: false, error: msg, status: res.status, data };
  } catch (e) {
    return { ok: false, skipped: false, error: e.message || String(e) };
  }
}

module.exports = { sendEmailViaNylas, normalizeTo };
