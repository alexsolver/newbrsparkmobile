'use strict';
const https  = require('https');
const http   = require('http');

/**
 * Testa uma integração fazendo uma chamada real ao provider.
 * @param {object} integration  Registro do banco (inclui apiKey completa)
 * @returns {{ ok: boolean, message: string, detail?: any }}
 */
async function testIntegration(integration) {
  const type = integration.type;   // IntType enum value
  const name = integration.name;

  // ── AI / LLM ────────────────────────────────────────────
  if (type === 'AI_LLM') {
    if (name === 'OpenAI') return testOpenAI(integration);
    if (name === 'Google AI (Gemini)') return testGoogleAI(integration);
    if (name === 'DeepSeek') return testDeepSeek(integration);
  }

  // ── E-mail ───────────────────────────────────────────────
  if (type === 'EMAIL') {
    if (name === 'Gmail' || name === 'Office 365' || name === 'SMTP Genérico') {
      return testSmtp(integration);
    }
  }

  // ── Catálogos / ERP ──────────────────────────────────────────
  if (type === 'ERP') {
    if (name === 'Bluesoft Cosmos') return testCosmos(integration);
    if (name === 'UPCItemDB') return testUpcItemDb(integration);
  }

  // ── Storage ──────────────────────────────────────────────
  if (type === 'STORAGE') {
    if (name === 'Dropbox')       return testDropbox(integration);
    if (name === 'Amazon S3')     return testS3(integration);
    if (name === 'Cloudflare R2') return testR2(integration);
  }

  return { ok: false, message: `Teste não implementado para "${name}"` };
}

// ── Helpers HTTP ──────────────────────────────────────────
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
    }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ── OpenAI ────────────────────────────────────────────────
async function testOpenAI({ apiKey }) {
  if (!apiKey) return { ok: false, message: 'API Key não configurada.' };
  try {
    const r = await httpsGet('api.openai.com', '/v1/models', { Authorization: `Bearer ${apiKey}` });
    if (r.status === 200) return { ok: true, message: 'OpenAI conectado com sucesso ✓' };
    if (r.status === 401) return { ok: false, message: 'API Key inválida (401 Unauthorized)' };
    return { ok: false, message: `HTTP ${r.status}` };
  } catch (e) { return { ok: false, message: `Erro de rede: ${e.message}` }; }
}

// ── Google AI ─────────────────────────────────────────────
async function testGoogleAI({ apiKey }) {
  if (!apiKey) return { ok: false, message: 'API Key não configurada.' };
  try {
    const r = await httpsGet('generativelanguage.googleapis.com', `/v1beta/models?key=${apiKey}`, {});
    if (r.status === 200) return { ok: true, message: 'Google AI (Gemini) conectado com sucesso ✓' };
    if (r.status === 400 || r.status === 403) return { ok: false, message: 'API Key inválida ou sem permissão' };
    return { ok: false, message: `HTTP ${r.status}` };
  } catch (e) { return { ok: false, message: `Erro de rede: ${e.message}` }; }
}

// ── DeepSeek ──────────────────────────────────────────────
async function testDeepSeek({ apiKey, baseUrl }) {
  if (!apiKey) return { ok: false, message: 'API Key não configurada.' };
  try {
    const hostname = (baseUrl || 'https://api.deepseek.com/v1').replace('https://', '').split('/')[0];
    const r = await httpsGet(hostname, '/models', { Authorization: `Bearer ${apiKey}` });
    if (r.status === 200) return { ok: true, message: 'DeepSeek conectado com sucesso ✓' };
    if (r.status === 401) return { ok: false, message: 'API Key inválida (401 Unauthorized)' };
    return { ok: false, message: `HTTP ${r.status}` };
  } catch (e) { return { ok: false, message: `Erro de rede: ${e.message}` }; }
}

// ── SMTP / Gmail / Office365 ──────────────────────────────
async function testSmtp({ description, baseUrl }) {
  // Extraímos host:port do baseUrl e user do description (user:xxx)
  const hostPort = (baseUrl || '').split(':');
  const host = hostPort[0];
  const port = parseInt(hostPort[1] || '587', 10);

  if (!host) return { ok: false, message: 'Host SMTP não configurado.' };

  return new Promise(resolve => {
    const proto = port === 465 ? require('tls') : require('net');
    const socket = proto.connect(port, host, { rejectUnauthorized: false }, () => {
      socket.destroy();
      resolve({ ok: true, message: `SMTP ${host}:${port} acessível ✓` });
    });
    socket.on('error', err => resolve({ ok: false, message: `SMTP inacessível: ${err.message}` }));
    socket.setTimeout(5000, () => { socket.destroy(); resolve({ ok: false, message: 'SMTP timeout (5s)' }); });
  });
}

// ── Dropbox ───────────────────────────────────────────────
function getDropboxAccessToken(appKey, appSecret, refreshToken) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString();
    const auth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
    const req = https.request({
      hostname: 'api.dropbox.com', path: '/oauth2/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${auth}`, 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body).access_token); } catch(e) { reject(e); }
        } else reject(new Error(`Oauth Error ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function testDropbox({ apiKey, description }) {
  if (!apiKey || !description) return { ok: false, message: 'App Key, Secret ou Refresh Token ausentes.' };
  
  const [appKey, ...secretParts] = apiKey.split(':');
  const appSecret = secretParts.join(':');
  const refreshToken = (description.match(/refresh_token:(\S+)/) || [])[1];

  if (!appKey || !appSecret || !refreshToken) {
    return { ok: false, message: 'OAuth2 incompleto. Configure App Key, Secret e Refresh Token.' };
  }

  try {
    const token = await getDropboxAccessToken(appKey.trim(), appSecret.trim(), refreshToken.trim());
    const r = await httpsPost('api.dropboxapi.com', '/2/users/get_current_account', { Authorization: `Bearer ${token}` }, 'null');
    
    if (r.status === 200) {
      const json = JSON.parse(r.body);
      return { ok: true, message: `Dropbox conectado: ${json.email || json.name?.display_name || '✓'}` };
    }
    if (r.status === 401) return { ok: false, message: 'Token de acesso inválido (401)' };
    return { ok: false, message: `HTTP ${r.status}` };
  } catch (e) { 
    return { ok: false, message: `Erro de rede ou OAuth: ${e.message}` }; 
  }
}

// ── SigV4 helper (reutilizado em R2 e S3) ────────────────
const crypto = require('crypto');

function _hmac(key, data, enc) { return crypto.createHmac('sha256', key).update(data, 'utf8').digest(enc); }
function _hash(data, enc) { return crypto.createHash('sha256').update(data).digest(enc); }

function signedHeadRequest({ hostname, bucket, region, accessKeyId, secretKey }) {
  return new Promise((resolve, reject) => {
    const now       = new Date();
    const date      = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const datestamp = date.slice(0, 8);
    const path      = `/${bucket}`;
    const payload   = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // SHA256 of empty string

    const canonicalHeaders = `host:${hostname}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n`;
    const signedHeaders    = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = ['HEAD', path, '', canonicalHeaders, signedHeaders, payload].join('\n');

    const credentialScope = `${datestamp}/${region}/s3/aws4_request`;
    const stringToSign    = ['AWS4-HMAC-SHA256', date, credentialScope, _hash(canonicalRequest, 'hex')].join('\n');

    const kDate    = _hmac(`AWS4${secretKey}`, datestamp);
    const kRegion  = _hmac(kDate, region);
    const kService = _hmac(kRegion, 's3');
    const kSigning = _hmac(kService, 'aws4_request');
    const signature = _hmac(kSigning, stringToSign, 'hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const req = require('https').request({
      hostname, path, method: 'HEAD',
      headers: {
        'x-amz-content-sha256': payload,
        'x-amz-date': date,
        'Authorization': authHeader,
      },
    }, res => resolve(res.statusCode));
    req.on('error', reject);
    req.end();
  });
}

// ── Cloudflare R2 ─────────────────────────────────────────
async function testR2({ apiKey, description }) {
  if (!apiKey) return { ok: false, message: 'Credenciais não configuradas.' };

  const [accessKeyId, ...secretParts] = apiKey.split(':');
  const secretKey = secretParts.join(':');
  const account   = (description?.match(/account:(\S+)/) || [])[1];
  const bucket    = (description?.match(/bucket:(\S+)/) || [])[1];

  if (!account || !bucket) return { ok: false, message: 'Account ID ou bucket não configurados.' };
  if (!accessKeyId || !secretKey) return { ok: false, message: 'Access Key ID ou Secret inválidos. Formato: keyid:secret' };

  try {
    const status = await signedHeadRequest({
      hostname:    `${account}.r2.cloudflarestorage.com`,
      bucket,
      region:      'auto',
      accessKeyId: accessKeyId.trim(),
      secretKey:   secretKey.trim(),
    });
    // 200 = ok | 403 = credenciais erradas | 404 = bucket não existe
    if (status === 200) return { ok: true, message: `Cloudflare R2 conectado — bucket "${bucket}" acessível ✓` };
    if (status === 403) return { ok: false, message: 'Credenciais inválidas ou sem permissão (403)' };
    if (status === 404) return { ok: false, message: `Bucket "${bucket}" não encontrado (404)` };
    return { ok: false, message: `R2 retornou HTTP ${status}` };
  } catch (e) { return { ok: false, message: `Erro de rede: ${e.message}` }; }
}

// ── Amazon S3 ─────────────────────────────────────────────
async function testS3({ apiKey, description }) {
  if (!apiKey) return { ok: false, message: 'Access Key não configurada.' };

  const [accessKeyId, ...secretParts] = apiKey.split(':');
  const secretKey = secretParts.join(':');
  const region    = (description?.match(/region:(\S+)/) || [])[1] || 'us-east-1';
  const bucket    = (description?.match(/bucket:(\S+)/) || [])[1];

  if (!bucket) return { ok: false, message: 'Bucket não configurado.' };

  try {
    const status = await signedHeadRequest({
      hostname:    `${bucket}.s3.${region}.amazonaws.com`,
      bucket,
      region,
      accessKeyId: accessKeyId.trim(),
      secretKey:   secretKey.trim(),
    });
    if (status === 200 || status === 301) return { ok: true, message: `Amazon S3 bucket "${bucket}" acessível ✓` };
    if (status === 403) return { ok: false, message: 'Credenciais inválidas ou sem permissão (403)' };
    if (status === 404) return { ok: false, message: `Bucket "${bucket}" não encontrado (404)` };
    return { ok: false, message: `S3 retornou HTTP ${status}` };
  } catch (e) { return { ok: false, message: `Erro de rede: ${e.message}` }; }
}

// ── Bluesoft Cosmos ───────────────────────────────────────
async function testCosmos({ apiKey, baseUrl }) {
  if (!apiKey) return { ok: false, message: 'X-Cosmos-Token não configurado.' };
  try {
    const hostname = (baseUrl || 'api.cosmos.bluesoft.com.br').replace('https://', '').split('/')[0];
    const r = await httpsGet(hostname, '/gtins/7894900011517.json', { 'X-Cosmos-Token': apiKey, 'User-Agent': 'BrSpark' });
    if (r.status === 200) return { ok: true, message: 'Bluesoft Cosmos conectado com sucesso ✓' };
    if (r.status === 401) return { ok: false, message: 'Token de acesso Cosmos inválido (401)' };
    if (r.status === 404) return { ok: true, message: 'Cosmos conectado ✓ (Produto de teste 404)' }; // Sometimes the test GTIN might be 404, but API works
    return { ok: false, message: `Integração retornou HTTP ${r.status}` };
  } catch (e) { return { ok: false, message: `Erro de rede: ${e.message}` }; }
}

// ── UPCItemDB ───────────────────────────────────────
async function testUpcItemDb({ apiKey, baseUrl }) {
  try {
    const defaultUrl = apiKey ? 'api.upcitemdb.com/prod/v1' : 'api.upcitemdb.com/prod/trial';
    const hostPath = (baseUrl || defaultUrl).replace('https://', '');
    const hostname = hostPath.split('/')[0];
    const basePath = '/' + hostPath.split('/').slice(1).join('/');
    
    // Testa com um UPC qualquer válido (Ex: 012993441012 - Altoids)
    const reqPath = `${basePath.endsWith('/') ? basePath.slice(0, -1) : basePath}/lookup?upc=012993441012`;
    
    const headers = { 'User-Agent': 'BrSpark' };
    if (apiKey) headers['user_key'] = apiKey;

    const r = await httpsGet(hostname, reqPath, headers);
    if (r.status === 200) return { ok: true, message: 'UPCItemDB conectado com sucesso ✓' };
    if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, message: `Erro de autorização ou chave inválida (${r.status})` };
    if (r.status === 404) return { ok: true, message: 'UPCItemDB conectado ✓ (Produto de teste não encontrado)' }; 
    return { ok: false, message: `Integração retornou HTTP ${r.status}` };
  } catch (e) { return { ok: false, message: `Erro de rede: ${e.message}` }; }
}

module.exports = { testIntegration };
