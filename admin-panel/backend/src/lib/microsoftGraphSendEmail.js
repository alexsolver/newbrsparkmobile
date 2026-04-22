'use strict';

const { normalizeTo } = require('./nylasSendEmail');
const {
  resolveMicrosoftGraphConfig,
  configFromIntegrationRow,
} = require('./microsoftGraphCredentials');

/** @type {Map<string, { token: string, expMs: number }>} */
const tokenCache = new Map();

function cacheKey(cfg) {
  return `${cfg.tenantId}|${cfg.clientId}|${cfg.graphBase}`;
}

/**
 * Token de aplicação (client credentials) para https://graph.microsoft.com/.default
 * @param {object} cfg — output de resolveMicrosoftGraphConfig / configFromIntegrationRow com ready true
 */
async function acquireMicrosoftGraphAccessToken(cfg) {
  const key = cacheKey(cfg);
  const now = Date.now();
  const hit = tokenCache.get(key);
  if (hit && hit.expMs > now + 60_000) {
    return { ok: true, accessToken: hit.token };
  }

  const tenant = encodeURIComponent(cfg.tenantId);
  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }

  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!res.ok || !data.access_token) {
    const msg =
      data.error_description ||
      data.error ||
      `Falha ao obter token Microsoft (${res.status}): ${String(raw).slice(0, 280)}`;
    return { ok: false, error: String(msg), status: res.status, data };
  }

  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache.set(key, {
    token: data.access_token,
    expMs: now + expiresIn * 1000,
  });
  return { ok: true, accessToken: data.access_token };
}

/**
 * Só para «Testar» no painel: valida client credentials contra o Entra ID.
 * @param {object} integration — registo completo da BD
 */
async function testMicrosoftGraphAccess(integration) {
  const cfg = configFromIntegrationRow(integration);
  if (!cfg.ready) {
    return {
      ok: false,
      message:
        'Preencha ID do inquilino, ID da aplicação, segredo do cliente e «Enviar como» (UPN da caixa com Mail.Send a nível de aplicação).',
    };
  }
  const tok = await acquireMicrosoftGraphAccessToken(cfg);
  if (!tok.ok) {
    return {
      ok: false,
      message: tok.error || 'Não foi possível obter token OAuth (client credentials).',
    };
  }
  return {
    ok: true,
    message: `Microsoft Entra: token obtido com sucesso (client credentials). Envio OTP usará a caixa ${cfg.sendAsUser}.`,
  };
}

/**
 * Envia e-mail via Microsoft Graph `POST /users/{id}/sendMail` (permissão de aplicação Mail.Send).
 *
 * @param {object} opts
 * @param {string|string[]|{ email: string, name?: string }} opts.to
 * @param {string} opts.subject
 * @param {string} [opts.text]
 * @param {string} [opts.html]
 * @param {string|string[]|{ email: string, name?: string }} [opts.replyTo]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, error?: string, status?: number, data?: unknown }>}
 */
async function sendEmailViaMicrosoftGraph(opts) {
  const { to, subject, text, html, replyTo } = opts || {};
  const cfg = await resolveMicrosoftGraphConfig();
  if (!cfg.ready) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Microsoft Graph não configurado. Em Integrações, adicione «Microsoft Graph» (inquilino, app ID, segredo, enviar como) ou defina MICROSOFT_GRAPH_* no .env.',
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

  const tok = await acquireMicrosoftGraphAccessToken(cfg);
  if (!tok.ok) {
    return { ok: false, skipped: false, error: tok.error || 'Token Microsoft inválido.' };
  }

  const graphRoot = String(cfg.graphBase || '').replace(/\/+$/, '');
  const sendPath = `${graphRoot}/users/${encodeURIComponent(cfg.sendAsUser)}/sendMail`;

  const bodyContent = htmlStr
    ? { contentType: 'HTML', content: htmlStr }
    : { contentType: 'Text', content: textStr };

  const message = {
    subject: String(subject || '').slice(0, 998),
    body: bodyContent,
    toRecipients: toList.map((r) => ({
      emailAddress: {
        address: r.email,
        ...(r.name ? { name: r.name } : {}),
      },
    })),
  };

  if (replyTo) {
    const rt = normalizeTo(replyTo);
    if (rt.length) {
      message.replyTo = rt.map((r) => ({
        emailAddress: { address: r.email, ...(r.name ? { name: r.name } : {}) },
      }));
    }
  }

  const payload = {
    message,
    saveToSentItems: false,
  };

  try {
    const res = await fetch(sendPath, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (res.ok || res.status === 202 || res.status === 204) {
      return { ok: true, skipped: false, status: res.status, data };
    }

    let msg =
      (data && (data.error?.message || data.error_description)) ||
      `HTTP ${res.status}: ${String(raw).slice(0, 240)}`;
    msg = String(msg);
    if (res.status === 401) {
      tokenCache.delete(cacheKey(cfg));
      msg =
        'Token Microsoft rejeitado (401). Verifique o segredo da aplicação e o consentimento de administrador para Mail.Send.';
    }
    return { ok: false, skipped: false, error: msg, status: res.status, data };
  } catch (e) {
    return { ok: false, skipped: false, error: e.message || String(e) };
  }
}

module.exports = {
  acquireMicrosoftGraphAccessToken,
  sendEmailViaMicrosoftGraph,
  testMicrosoftGraphAccess,
};
