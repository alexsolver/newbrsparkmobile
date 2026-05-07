/**
 * One-off: exchange Dropbox OAuth authorization code for refresh token and store in DB.
 * Run from admin-panel/backend:
 *   DROPBOX_APP_KEY=... DROPBOX_APP_SECRET=... DROPBOX_OAUTH_CODE=... node scripts/exchange_dbx.js
 * Se o fluxo de authorize usou redirect_uri, defina também DROPBOX_REDIRECT_URI com o mesmo valor.
 * Na URL de authorize inclua token_access_type=offline para receber refresh_token.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  exchangeDropboxAuthorizationCode,
  normalizeIntegrationMetadata,
} = require('../src/lib/dropboxOAuth');

const code = process.env.DROPBOX_OAUTH_CODE;
const appKey = process.env.DROPBOX_APP_KEY;
const appSecret = process.env.DROPBOX_APP_SECRET;
const redirectUri = process.env.DROPBOX_REDIRECT_URI;

if (!code || !appKey || !appSecret) {
  console.error(
    'Missing env: DROPBOX_OAUTH_CODE, DROPBOX_APP_KEY, DROPBOX_APP_SECRET'
  );
  process.exit(1);
}

(async () => {
  try {
    const result = await exchangeDropboxAuthorizationCode({
      code,
      appKey,
      appSecret,
      redirectUri: redirectUri || undefined,
    });
    console.log('Success! refresh_token:', result.refresh_token);

    const dbx = await prisma.integration.findFirst({
      where: { name: 'Dropbox' },
    });
    if (dbx && result.refresh_token) {
      const prevMeta = normalizeIntegrationMetadata(dbx);
      await prisma.integration.update({
        where: { id: dbx.id },
        data: {
          description: `refresh_token:${result.refresh_token}`,
          metadata: {
            ...prevMeta,
            dropboxRefreshToken: result.refresh_token,
          },
          status: 'ACTIVE',
        },
      });
      console.log('DB updated (description + metadata.dropboxRefreshToken).');
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
