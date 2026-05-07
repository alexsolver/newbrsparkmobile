'use strict';

const https = require('https');

/** Hosts usados em sequência (guias Dropbox mostram api.dropbox.com; outros fluxos usam api.dropboxapi.com). */
const DROPBOX_TOKEN_HOSTS = ['api.dropbox.com', 'api.dropboxapi.com'];

/** Remove BOM, zero-width e aspas acidentais (colagem do browser/docs). */
function sanitizeDropboxRefreshToken(token) {
  if (!token || typeof token !== 'string') return '';
  return token
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/** Alguns utilizadores colam o prefixo outra vez dentro do campo. */
function stripRefreshTokenArtifactPrefixes(token) {
  let t = sanitizeDropboxRefreshToken(token);
  const prefix = /^refresh_token:/i;
  while (prefix.test(t)) {
    t = t.replace(prefix, '').trim();
  }
  return t;
}

/** Access tokens curtos da Dropbox começam por `sl.` — não são refresh tokens. */
function looksLikeDropboxShortLivedAccessToken(t) {
  const s = sanitizeDropboxRefreshToken(String(t || ''));
  return s.startsWith('sl.');
}

/**
 * Remove `dropboxRefreshToken` do metadata se for access_token (sl.), para não sobrepor o refresh em `description`.
 */
function pruneInvalidDropboxRefreshFromMetadata(metadata) {
  const meta = { ...normalizeIntegrationMetadata({ metadata }) };
  const rt = meta.dropboxRefreshToken;
  if (rt != null && looksLikeDropboxShortLivedAccessToken(String(rt))) {
    delete meta.dropboxRefreshToken;
  }
  return meta;
}

/** Colagem acidental da resposta JSON inteira. */
function unwrapJsonRefreshTokenIfPresent(s) {
  const t = String(s || '').trim();
  if (!t.startsWith('{')) return t;
  try {
    const j = JSON.parse(t);
    if (j && typeof j.refresh_token === 'string' && j.refresh_token.trim()) {
      return j.refresh_token.trim();
    }
  } catch (_) {
    /* não é JSON */
  }
  return t;
}

function normalizeIntegrationMetadata(integration) {
  const m = integration?.metadata;
  if (m == null) return {};
  if (typeof m === 'string') {
    try {
      const p = JSON.parse(m);
      return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof m === 'object' && !Array.isArray(m)) return m;
  return {};
}

/**
 * Extrai refresh token do texto `description` (formato legado `refresh_token:<token>`).
 */
function extractDropboxRefreshToken(description) {
  if (!description || typeof description !== 'string') return null;
  const key = 'refresh_token:';
  const idx = description.indexOf(key);
  if (idx === -1) return null;
  let raw = description.slice(idx + key.length).trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1).trim();
  }
  raw = unwrapJsonRefreshTokenIfPresent(raw);
  const nl = raw.indexOf('\n');
  if (nl !== -1) raw = raw.slice(0, nl).trim();
  const token = (raw.split(/\s+/)[0] || '').trim();
  const cleaned = stripRefreshTokenArtifactPrefixes(token);
  return cleaned.length ? cleaned : null;
}

/**
 * Resolve refresh token: usa metadata só se não for access_token `sl.*`; senão usa `description`.
 * (Evita metadata antigo errado mascarar um refresh válido na description.)
 */
function resolveDropboxRefreshToken(integration) {
  const meta = normalizeIntegrationMetadata(integration);
  let metaRaw =
    meta.dropboxRefreshToken != null && String(meta.dropboxRefreshToken).trim() !== ''
      ? String(meta.dropboxRefreshToken)
      : '';
  metaRaw = unwrapJsonRefreshTokenIfPresent(metaRaw);
  metaRaw = stripRefreshTokenArtifactPrefixes(metaRaw);

  let descRaw = extractDropboxRefreshToken(integration?.description) || '';
  descRaw = stripRefreshTokenArtifactPrefixes(descRaw);

  const metaOk = metaRaw.length > 0 && !looksLikeDropboxShortLivedAccessToken(metaRaw);
  const descOk = descRaw.length > 0 && !looksLikeDropboxShortLivedAccessToken(descRaw);

  if (metaOk) return sanitizeDropboxRefreshToken(metaRaw);
  if (descOk) return sanitizeDropboxRefreshToken(descRaw);
  return sanitizeDropboxRefreshToken(metaRaw || descRaw || '');
}

function parseOAuthErrorHint(statusCode, body) {
  if (statusCode !== 400 || !body || typeof body !== 'string') return '';
  try {
    const j = JSON.parse(body);
    const desc = String(j.error_description || '');
    if (j.error === 'invalid_grant' && desc.includes('malformed')) {
      return (
        ' — Confirme no Dropbox Developers que colou o campo refresh_token (resposta JSON do POST /oauth2/token), ' +
        'com authorize incluindo token_access_type=offline. Não use ?code=, access_token, nem "Generated access token". ' +
        'Passos: (1) Abra https://www.dropbox.com/oauth2/authorize?client_id=SEU_APP_KEY&response_type=code&token_access_type=offline ' +
        '(adicione &redirect_uri=... se o app tiver redirect configurado). (2) Troque o code por tokens via curl ou npm run dropbox:exchange. ' +
        '(3) Salve de novo no painel só o refresh_token.'
      );
    }
  } catch (_) {
    /* ignore */
  }
  return '';
}

function postDropboxOAuthToken(hostname, bodyString, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: '/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(bodyString),
          ...extraHeaders,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (d) => {
          body += d;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body).access_token);
            } catch (e) {
              reject(e);
            }
          } else {
            const hint = parseOAuthErrorHint(res.statusCode, body);
            reject(new Error(`Dropbox OAuth Error ${res.statusCode}: ${body}${hint}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyString);
    req.end();
  });
}

/**
 * Obtém access_token curta duração usando refresh_token (OAuth2 Dropbox).
 * Tenta api.dropbox.com e depois api.dropboxapi.com com o mesmo corpo (exceto se o erro for token malformado).
 */
async function getDropboxAccessToken(appKey, appSecret, refreshToken) {
  const bodyForm = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: appKey,
    client_secret: appSecret,
  }).toString();

  const bodyBasic = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  }).toString();
  const basicAuth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');

  const attempts = [];
  for (const hostname of DROPBOX_TOKEN_HOSTS) {
    attempts.push({ hostname, body: bodyForm, headers: {} });
  }
  for (const hostname of DROPBOX_TOKEN_HOSTS) {
    attempts.push({
      hostname,
      body: bodyBasic,
      headers: { Authorization: `Basic ${basicAuth}` },
    });
  }

  let lastErr;
  for (const { hostname, body, headers } of attempts) {
    try {
      return await postDropboxOAuthToken(hostname, body, headers);
    } catch (e) {
      lastErr = e;
      if (String(e.message || '').includes('malformed')) throw e;
    }
  }
  throw lastErr;
}

/**
 * Troca authorization code por tokens (incl. refresh_token com token_access_type=offline no authorize).
 * @returns {Promise<object>} Corpo JSON da Dropbox (access_token, refresh_token, expires_in, …)
 */
async function exchangeDropboxAuthorizationCode({ code, appKey, appSecret, redirectUri }) {
  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: appKey,
    client_secret: appSecret,
  });
  if (redirectUri) params.append('redirect_uri', redirectUri);
  const data = params.toString();

  let lastStatus = 0;
  let lastBody = '';
  for (const hostname of DROPBOX_TOKEN_HOSTS) {
    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          path: '/oauth2/token',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (d) => {
            body += d;
          });
          res.on('end', () => {
            resolve({ statusCode: res.statusCode, body });
          });
        }
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
    lastStatus = result.statusCode;
    lastBody = result.body;
    if (result.statusCode >= 200 && result.statusCode < 300) {
      try {
        return JSON.parse(result.body);
      } catch (e) {
        throw new Error(`Dropbox token response inválido: ${result.body}`);
      }
    }
  }
  throw new Error(`Dropbox OAuth Error ${lastStatus}: ${lastBody}`);
}

module.exports = {
  sanitizeDropboxRefreshToken,
  extractDropboxRefreshToken,
  resolveDropboxRefreshToken,
  normalizeIntegrationMetadata,
  pruneInvalidDropboxRefreshFromMetadata,
  looksLikeDropboxShortLivedAccessToken,
  getDropboxAccessToken,
  exchangeDropboxAuthorizationCode,
  DROPBOX_TOKEN_HOSTS,
};
