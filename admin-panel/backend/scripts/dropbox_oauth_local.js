/**
 * OAuth Dropbox em localhost: abre o browser, recebe o redirect e grava refresh_token na integração.
 *
 * Pré-requisitos:
 *   - .env com DROPBOX_APP_KEY e DROPBOX_APP_SECRET
 *   - No app Dropbox → OAuth 2 → Redirect URIs: adicione o URI impresso ao arrancar (http://127.0.0.1:PORTA/...)
 *
 * Uso (na pasta admin-panel/backend):
 *   npm run dropbox:oauth-local
 *
 * Opcional: DROPBOX_OAUTH_PORT (default 8765), DROPBOX_REDIRECT_URI (sobrepõe host/porta/path gerados)
 */
'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  exchangeDropboxAuthorizationCode,
  normalizeIntegrationMetadata,
} = require('../src/lib/dropboxOAuth');

const appKey = process.env.DROPBOX_APP_KEY;
const appSecret = process.env.DROPBOX_APP_SECRET;
const port = parseInt(process.env.DROPBOX_OAUTH_PORT || '8765', 10);
const redirectPath = '/dropbox-oauth-callback';
const redirectUri =
  process.env.DROPBOX_REDIRECT_URI || `http://127.0.0.1:${port}${redirectPath}`;
const TIMEOUT_MS = parseInt(process.env.DROPBOX_OAUTH_TIMEOUT_MS || '300000', 10);

if (!appKey || !appSecret) {
  console.error('Defina DROPBOX_APP_KEY e DROPBOX_APP_SECRET no .env');
  process.exit(1);
}

function htmlPage(title, bodyInner) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${bodyInner}</body></html>`;
}

async function ensureDropboxRow() {
  let dbx = await prisma.integration.findFirst({ where: { name: 'Dropbox' } });
  if (dbx) {
    const pair = `${appKey}:${appSecret}`;
    if (!dbx.apiKey || String(dbx.apiKey).trim() === '') {
      dbx = await prisma.integration.update({
        where: { id: dbx.id },
        data: { apiKey: pair },
      });
    }
    return dbx;
  }
  console.log('Criando integração Dropbox no banco…');
  return prisma.integration.create({
    data: {
      name: 'Dropbox',
      type: 'STORAGE',
      status: 'ACTIVE',
      apiKey: `${appKey}:${appSecret}`,
      baseUrl: '/Aria',
      description: 'refresh_token:',
      metadata: {},
    },
  });
}

async function saveTokens(refreshToken) {
  const dbx = await ensureDropboxRow();
  const prevMeta = normalizeIntegrationMetadata(dbx);
  await prisma.integration.update({
    where: { id: dbx.id },
    data: {
      description: `refresh_token:${refreshToken}`,
      metadata: { ...prevMeta, dropboxRefreshToken: refreshToken },
      status: 'ACTIVE',
    },
  });
}

(async () => {
  const state = crypto.randomBytes(16).toString('hex');

  console.log(`
=== Dropbox OAuth (offline) ===

1) Dropbox Developers → a sua app → Settings → OAuth 2
   Em "Redirect URIs", adicione EXACTAMENTE esta linha e guarde:

   ${redirectUri}

2) Arranque já está a escutar neste URI. Vamos abrir o browser para autorizar.

`);

  const authorizeUrl =
    `https://www.dropbox.com/oauth2/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(appKey)}` +
    `&token_access_type=offline` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    } catch {
      res.writeHead(400);
      res.end('URL inválido');
      return;
    }

    if (url.pathname !== redirectPath) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const errParam = url.searchParams.get('error');
    const errDesc = url.searchParams.get('error_description');
    if (errParam) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage(
          'Dropbox OAuth',
          `<p>Falhou: <strong>${errParam}</strong></p><p>${errDesc || ''}</p>`,
        ),
      );
      console.error('OAuth error:', errParam, errDesc);
      server.close();
      await prisma.$disconnect();
      process.exit(1);
      return;
    }

    if (url.searchParams.get('state') !== state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage('Dropbox OAuth', '<p>State inválido (CSRF). Feche e volte a correr o script.</p>'));
      console.error('state mismatch');
      server.close();
      await prisma.$disconnect();
      process.exit(1);
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code');
      server.close();
      await prisma.$disconnect();
      process.exit(1);
      return;
    }

    try {
      const json = await exchangeDropboxAuthorizationCode({
        code,
        appKey,
        appSecret,
        redirectUri,
      });
      if (!json.refresh_token) {
        throw new Error(
          'Resposta sem refresh_token. Confirme token_access_type=offline na autorização.',
        );
      }
      await saveTokens(json.refresh_token);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        htmlPage(
          'Dropbox OK',
          '<p><strong>Concluído.</strong> O refresh token foi guardado na integração Dropbox.</p><p>Pode fechar esta página e testar no painel admin.</p>',
        ),
      );
      console.log('\n✓ refresh_token guardado na base de dados (integration Dropbox).\n');
      server.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (e) {
      console.error(e);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const msg = String(e.message || e).replace(/</g, '&lt;');
      res.end(htmlPage('Dropbox OAuth', `<p>Erro na troca do código:</p><pre>${msg}</pre>`));
      server.close();
      await prisma.$disconnect();
      process.exit(1);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`À escuta em http://127.0.0.1:${port}${redirectPath}\n`);
    if (process.platform === 'darwin') {
      try {
        execFileSync('open', [authorizeUrl], { stdio: 'ignore' });
        console.log('Browser aberto com o pedido de autorização Dropbox.\n');
      } catch {
        console.log('Abra manualmente:\n\n', authorizeUrl, '\n');
      }
    } else {
      console.log('Abra no browser:\n\n', authorizeUrl, '\n');
    }
  });

  server.on('error', (e) => {
    console.error('Servidor:', e.message);
    prisma.$disconnect();
    process.exit(1);
  });

  setTimeout(async () => {
    console.error('\nTempo esgotado. Corra de novo o script.\n');
    server.close();
    await prisma.$disconnect();
    process.exit(1);
  }, TIMEOUT_MS);
})();
