/**
 * One-off: exchange Dropbox OAuth authorization code for refresh token and store in DB.
 * Run from admin-panel/backend:
 *   DROPBOX_APP_KEY=... DROPBOX_APP_SECRET=... DROPBOX_OAUTH_CODE=... node scripts/exchange_dbx.js
 * Or set those variables in .env (never commit real values).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

const code = process.env.DROPBOX_OAUTH_CODE;
const appKey = process.env.DROPBOX_APP_KEY;
const appSecret = process.env.DROPBOX_APP_SECRET;

if (!code || !appKey || !appSecret) {
  console.error(
    'Missing env: DROPBOX_OAUTH_CODE, DROPBOX_APP_KEY, DROPBOX_APP_SECRET'
  );
  process.exit(1);
}

const auth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');
const data = new URLSearchParams({
  code: code,
  grant_type: 'authorization_code'
}).toString();

const req = https.request(
  {
    hostname: 'api.dropbox.com',
    path: '/oauth2/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
      'Content-Length': Buffer.byteLength(data)
    }
  },
  (res) => {
    let body = '';
    res.on('data', (d) => (body += d));
    res.on('end', async () => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const result = JSON.parse(body);
          console.log('Success! Refresh Token:', result.refresh_token);

          const dbx = await prisma.integration.findFirst({
            where: { name: 'Dropbox' }
          });
          if (dbx && result.refresh_token) {
            await prisma.integration.update({
              where: { id: dbx.id },
              data: {
                description: `refresh_token:${result.refresh_token}`,
                status: 'ACTIVE'
              }
            });
            console.log('DB Updated to ACTIVE with new refresh token.');
          }
        } else {
          console.error('Error from Dropbox:', res.statusCode, body);
        }
      } catch (e) {
        console.error(e);
      }
      prisma.$disconnect();
    });
  }
);
req.on('error', (e) => console.error(e));
req.write(data);
req.end();
