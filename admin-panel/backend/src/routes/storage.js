'use strict';
const router   = require('express').Router();
const prisma   = require('../db');
const authUser = require('../middleware/authUser');
const {
  resolvePublicApiOriginForUploads,
  ensureHttpsUrlForPublicInternet,
} = require('../lib/publicHttpsUrl');
const https    = require('https');
const crypto   = require('crypto');

router.use(authUser);

// ── Provider: busca integração de storage ativa ───────────
async function getStorageIntegration() {
  // Prioridade: R2 → S3 → Dropbox
  const r2 = await prisma.integration.findFirst({
    where: { type: 'STORAGE', name: 'Cloudflare R2', status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
  });
  if (r2) return { provider: 'r2', ...r2 };

  const s3 = await prisma.integration.findFirst({
    where: { type: 'STORAGE', name: 'Amazon S3', status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
  });
  if (s3) return { provider: 's3', ...s3 };

  const dropbox = await prisma.integration.findFirst({
    where: { type: 'STORAGE', name: 'Dropbox', status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
  });
  if (dropbox) return { provider: 'dropbox', ...dropbox };

  return null;
}

// ── AWS SigV4 helpers ─────────────────────────────────────

function hmac(key, data, encoding) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest(encoding);
}

function hash(data, encoding) {
  return crypto.createHash('sha256').update(data).digest(encoding);
}

/**
 * Assina e executa uma requisição PUT S3-compatible (R2 ou AWS).
 * @param {object} opts
 * @param {string} opts.endpoint    ex: 'account.r2.cloudflarestorage.com'
 * @param {string} opts.bucket      nome do bucket
 * @param {string} opts.key         path do objeto (ex: media/user/file.jpg)
 * @param {string} opts.region      'auto' para R2 | 'us-east-1' para AWS
 * @param {string} opts.accessKeyId
 * @param {string} opts.secretKey
 * @param {Buffer} opts.body        conteúdo do arquivo
 * @param {string} opts.contentType MIME type
 */
function putS3Object({ endpoint, bucket, key, region, accessKeyId, secretKey, body, contentType }) {
  return new Promise((resolve, reject) => {
    const now    = new Date();
    const date   = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z'; // YYYYMMDDTHHmmssZ
    const datestamp = date.slice(0, 8); // YYYYMMDD

    const service    = 's3';
    // AWS expects the Canonical URI to be properly URI-encoded
    const objectPath = `/${bucket}/${key}`.split('/').map(encodeURIComponent).join('/');
    const payloadHash = hash(body, 'hex');

    const host = endpoint;

    // Canonical headers (sorted)
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`;
    const signedHeaders    = 'content-type;host;x-amz-content-sha256;x-amz-date';

    // Canonical request
    const canonicalRequest = [
      'PUT',
      objectPath,
      '',    // query string (empty)
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // String to sign
    const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      date,
      credentialScope,
      hash(canonicalRequest, 'hex'),
    ].join('\n');

    // Signing key
    const kDate    = hmac(`AWS4${secretKey}`, datestamp);
    const kRegion  = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign, 'hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options = {
      hostname: host,
      path:     objectPath,
      method:   'PUT',
      headers: {
        'Content-Type':           contentType,
        'Content-Length':         body.length,
        'x-amz-content-sha256':   payloadHash,
        'x-amz-date':             date,
        'Authorization':          authHeader,
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`S3/R2 PUT ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── R2 Upload ─────────────────────────────────────────────
async function uploadToR2(buffer, integration, remotePath, contentType) {
  // apiKey armazenado como "keyid:secret"
  const [accessKeyId, ...secretParts] = (integration.apiKey || '').split(':');
  const secretKey = secretParts.join(':');

  if (!accessKeyId || !secretKey) throw new Error('R2: Access Key ID e Secret inválidos. Formato esperado: keyid:secret');

  // description armazenado como "account:xxx bucket:yyy"
  const accountId = (integration.description?.match(/account:(\S+)/) || [])[1];
  const bucket    = (integration.description?.match(/bucket:(\S+)/) || [])[1];

  if (!accountId || !bucket) throw new Error('R2: Account ID ou bucket não configurados.');

  const endpoint = `${accountId}.r2.cloudflarestorage.com`;

  await putS3Object({
    endpoint,
    bucket,
    key:         remotePath,
    region:      'auto',
    accessKeyId: accessKeyId.trim(),
    secretKey:   secretKey.trim(),
    body:        buffer,
    contentType,
  });

  // URL pública (funciona se o bucket tem "Public Access" habilitado no R2)
  const publicUrl = `https://pub-${accountId}.r2.dev/${remotePath}`;

  return { path: `/${bucket}/${remotePath}`, url: publicUrl };
}

// ── S3 Upload ─────────────────────────────────────────────
async function uploadToS3(buffer, integration, remotePath, contentType) {
  const [accessKeyId, ...secretParts] = (integration.apiKey || '').split(':');
  const secretKey = secretParts.join(':');

  const region = (integration.description?.match(/region:(\S+)/) || [])[1] || 'us-east-1';
  const bucket  = (integration.description?.match(/bucket:(\S+)/) || [])[1];

  if (!bucket) throw new Error('S3: bucket não configurado.');

  const endpoint = `${bucket}.s3.${region}.amazonaws.com`;

  await putS3Object({
    endpoint,
    bucket,
    key:         remotePath,
    region,
    accessKeyId: accessKeyId.trim(),
    secretKey:   secretKey.trim(),
    body:        buffer,
    contentType,
  });

  const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${remotePath}`;
  return { path: `/${bucket}/${remotePath}`, url: publicUrl };
}

// ── Dropbox ───────────────────────────────────────────────
function getDropboxAccessToken(appKey, appSecret, refreshToken) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString();
    const auth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
    
    const req = https.request({
      hostname: 'api.dropbox.com',
      path: '/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body).access_token);
          } catch(e) { reject(e); }
        } else {
          reject(new Error(`Dropbox Oauth Error ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Dropbox Upload (mantido como fallback) ────────────────
function uploadToDropbox(buffer, token, dropboxPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'content.dropboxapi.com',
      path:     '/2/files/upload',
      method:   'POST',
      headers: {
        Authorization:      `Bearer ${token}`,
        'Content-Type':     'application/octet-stream',
        'Dropbox-API-Arg':  JSON.stringify({ path: dropboxPath, mode: 'overwrite', autorename: false, mute: false }),
        'Content-Length':   buffer.length,
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ path_display: dropboxPath });
        else reject(new Error(`Dropbox ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ── Fallback de Servidor Local ─────────────────────────────
function saveLocalFallback(buffer, remotePath, req) {
  const fs = require('fs');
  const path = require('path');
  const localDir = path.join(__dirname, '../../public/uploads/storage');
  const finalPath = path.join(localDir, remotePath);
  
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, buffer);

  const origin = resolvePublicApiOriginForUploads(req).replace(/\/+$/, '');
  return ensureHttpsUrlForPublicInternet(`${origin}/uploads/storage/${remotePath}`);
}

// ── Dropbox Gerar Link Direto ──────────────────────────────
function getDropboxDirectLink(token, dropboxPath) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      path: dropboxPath,
      settings: { requested_visibility: 'public' }
    });
    const req = https.request({
      hostname: 'api.dropboxapi.com',
      path: '/2/sharing/create_shared_link_with_settings',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const result = JSON.parse(body);
            let url = result.url;
            if (url) url = url.replace('?dl=0', '?raw=1');
            resolve(url);
          } catch(e) { reject(e); }
        } else if (res.statusCode === 409 && body.includes('shared_link_already_exists')) {
          try {
            // Se já existir um link, tentamos pegar o que já existe no erro
            const result = JSON.parse(body);
            let url = result.error.shared_link_already_exists.metadata.url;
            if (url) url = url.replace('?dl=0', '?raw=1');
            resolve(url);
          } catch(e) { reject(e); }
        } else {
          reject(new Error(`Dropbox Link ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── POST /api/storage/upload ──────────────────────────────
// Body JSON: { fileBase64: string, mimeType: string, name: string, path: string }
router.post('/upload', async (req, res) => {
  try {
    const { fileBase64, mimeType, name, path: remotePath } = req.body;

    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 é obrigatório.' });

    const buffer      = Buffer.from(fileBase64, 'base64');
    const contentType = mimeType || 'application/octet-stream';

    const integration = await getStorageIntegration();

    if (!integration) {
      console.warn('[STORAGE] Nenhuma integração configurada. Usando disco local (uploads/storage).');
      const fallbackUrl = saveLocalFallback(buffer, remotePath, req);
      return res.json({ url: ensureHttpsUrlForPublicInternet(fallbackUrl), provider: 'local', path: remotePath });
    }

    if (integration.provider === 'r2') {
      console.log(`[STORAGE] R2 upload: ${remotePath} (${buffer.length} bytes)`);
      const result = await uploadToR2(buffer, integration, remotePath, contentType);
      console.log(`[STORAGE] R2 OK → ${result.path}`);
      return res.json({ url: ensureHttpsUrlForPublicInternet(result.url), provider: 'r2', path: result.path });
    }

    if (integration.provider === 's3') {
      console.log(`[STORAGE] S3 upload: ${remotePath} (${buffer.length} bytes)`);
      const result = await uploadToS3(buffer, integration, remotePath, contentType);
      console.log(`[STORAGE] S3 OK → ${result.path}`);
      return res.json({ url: ensureHttpsUrlForPublicInternet(result.url), provider: 's3', path: result.path });
    }

    if (integration.provider === 'dropbox') {
      const [appKey, ...secretParts] = (integration.apiKey || '').split(':');
      const appSecret = secretParts.join(':');
      const refreshToken = (integration.description?.match(/refresh_token:(\S+)/) || [])[1];

      if (!appKey || !appSecret || !refreshToken) {
        throw new Error('Dropbox OAuth2 incompleto. Configure App Key, Secret e Refresh Token no painel.');
      }

      console.log('[STORAGE] Renovando token do Dropbox...');
      const token = await getDropboxAccessToken(appKey.trim(), appSecret.trim(), refreshToken.trim());
      const rootFolder  = integration.baseUrl || '/Aria';
      const dropboxPath = `${rootFolder}/${remotePath}`.replace(/\/\//g, '/');
      console.log(`[STORAGE] Dropbox upload: ${dropboxPath} (${buffer.length} bytes)`);
      await uploadToDropbox(buffer, token, dropboxPath);
      console.log(`[STORAGE] Dropbox OK → ${dropboxPath}`);
      
      try {
        const publicUrl = await getDropboxDirectLink(token, dropboxPath);
        return res.json({ url: ensureHttpsUrlForPublicInternet(publicUrl), provider: 'dropbox', path: dropboxPath });
      } catch (linkErr) {
        console.warn(`[STORAGE] Dropbox shared link alert: ${linkErr.message}. Fallbacking to local server...`);
        const fallbackUrl = saveLocalFallback(buffer, remotePath, req);
        return res.json({
          url: ensureHttpsUrlForPublicInternet(fallbackUrl),
          provider: 'dropbox_local_fallback',
          path: remotePath,
        });
      }
    }

    return res.json({ url: null, provider: integration.provider, path: remotePath });

  } catch (err) {
    console.error('[STORAGE] Erro na nuvem externa:', err.message, 'Iniciando Upload Local Seguro...');
    try {
        const { fileBase64, path: remotePath } = req.body;
        const buffer = Buffer.from(fileBase64, 'base64');
        const fallbackUrl = saveLocalFallback(buffer, remotePath, req);
        return res.json({
          url: ensureHttpsUrlForPublicInternet(fallbackUrl),
          provider: 'local_fallback_on_error',
          path: remotePath,
        });
    } catch(fallErr) {
        console.error('[STORAGE] Falha catastrófica no disco local:', fallErr);
        res.status(500).json({ error: `Upload externo E local falharam: ${err.message}` });
    }
  }
});

// ── GET /api/storage/config ───────────────────────────────
router.get('/config', async (_req, res) => {
  try {
    const integration = await getStorageIntegration();
    if (!integration) return res.json({ provider: 'none', configured: false });
    res.json({ configured: true, provider: integration.provider, name: integration.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SYNC WORKER: Stranded Local Files -> Cloud ─────────────
let isSyncing = false;
async function syncStrandedFiles() {
  if (isSyncing) return;
  isSyncing = true;
  const fs = require('fs');
  const path = require('path');
  try {
    const integration = await getStorageIntegration();
    if (!integration) { isSyncing = false; return; }
    
    let dbxToken = null;
    if (integration.provider === 'dropbox') {
      const [appKey, ...secretParts] = (integration.apiKey || '').split(':');
      const appSecret = secretParts.join(':');
      const refreshToken = (integration.description?.match(/refresh_token:(\S+)/) || [])[1];
      if (appKey && appSecret && refreshToken) {
         dbxToken = await getDropboxAccessToken(appKey.trim(), appSecret.trim(), refreshToken.trim());
      } else { isSyncing = false; return; }
    }

    const localDir = path.join(__dirname, '../../public/uploads/storage');
    if (!fs.existsSync(localDir)) { isSyncing = false; return; }

    function getFiles(dir, filesList = []) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          getFiles(fullPath, filesList);
        } else {
          filesList.push(fullPath);
        }
      }
      return filesList;
    }

    const allFiles = getFiles(localDir);
    
    for (const fullPath of allFiles) {
      if (!fullPath.includes('.')) continue; // ignore hidden or weird files
      const remotePath = fullPath.replace(localDir + '/', '');
      const buffer = fs.readFileSync(fullPath);
      let newUrl = null;

      try {
        if (integration.provider === 'r2') {
          const res = await uploadToR2(buffer, integration, remotePath, 'application/octet-stream');
          newUrl = res.url;
        } else if (integration.provider === 's3') {
          const res = await uploadToS3(buffer, integration, remotePath, 'application/octet-stream');
          newUrl = res.url;
        } else if (integration.provider === 'dropbox') {
          const rootFolder = integration.baseUrl || '/Aria';
          const dropboxPath = `${rootFolder}/${remotePath}`.replace(/\\/g, '/').replace(/\/\//g, '/');
          await uploadToDropbox(buffer, dbxToken, dropboxPath);
          newUrl = await getDropboxDirectLink(dbxToken, dropboxPath);
        }
        
        if (newUrl) {
          // Update DB ChecklistExecutions
          const executions = await prisma.checklistExecution.findMany({
             where: { responses: { not: null } }
          });
          for (const ex of executions) {
             const respStr = JSON.stringify(ex.responses || {});
             // Local path in URL looks like /uploads/storage/media/xyz.jpg
             if (respStr.includes('uploads/storage/' + remotePath)) {
                // regex to replace http(s)://.../uploads/storage/PATH -> newUrl
                const safeRemotePath = remotePath.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const newRespStr = respStr.replace(new RegExp(`http[^"]*?uploads\\/storage\\/${safeRemotePath}`, 'g'), newUrl);
                await prisma.checklistExecution.update({
                   where: { id: ex.id },
                   data: { responses: JSON.parse(newRespStr) }
                });
                console.log(`[SYNC-WORKER] Re-writed URL in DB OS: ${ex.id}`);
             }
          }
          // Delete local file to prevent double-sync
          fs.unlinkSync(fullPath);
          console.log(`[SYNC-WORKER] File sent to cloud & deleted locally: ${remotePath}`);
        }
      } catch (uploadErr) {
        console.warn(`[SYNC-WORKER] Failed to upload ${remotePath}: ${uploadErr.message}`);
      }
    }
    
    // Auto cleanup empty dirs (max depth 3 is enough to clean structure)
    function cleanEmptyFoldersRecursively(folder) {
        if (!fs.existsSync(folder)) return;
        if (!fs.statSync(folder).isDirectory()) return;
        let files = fs.readdirSync(folder);
        if (files.length > 0) {
            files.forEach(file => cleanEmptyFoldersRecursively(path.join(folder, file)));
            files = fs.readdirSync(folder); // Check again after recursive
        }
        if (files.length === 0 && folder !== localDir) fs.rmdirSync(folder);
    }
    cleanEmptyFoldersRecursively(localDir);
    
  } catch (err) {
    console.error('[SYNC-WORKER] Critical error:', err.message);
  } finally {
    isSyncing = false;
  }
}

// Start watching every 10 minutes
setInterval(syncStrandedFiles, 10 * 60 * 1000);

// Manual endpoint
router.post('/sync-local', async (req, res) => {
  if (isSyncing) return res.json({ status: 'already_running' });
  syncStrandedFiles(); // Do not await
  res.json({ status: 'started' });
});

module.exports = router;
