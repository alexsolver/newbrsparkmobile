/**
 * Dev utility: test Dropbox refresh-token flow using credentials from the integration row.
 * Run from admin-panel/backend: node scripts/test_dbx.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');

function getDropboxAccessToken(appKey, appSecret, refreshToken) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString();
    const auth = Buffer.from(`${appKey}:${appSecret}`).toString('base64');

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
            reject(new Error(`Dropbox Oauth Error ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const dbx = await prisma.integration.findFirst({
    where: { name: 'Dropbox' }
  });

  if (!dbx) return console.log('Not found');

  const [appKey, ...secretParts] = (dbx.apiKey || '').split(':');
  const appSecret = secretParts.join(':');
  const refreshToken = (dbx.description?.match(/refresh_token:(\S+)/) || [])[1];

  console.log('AppKey:', appKey);
  console.log('AppSecret:', appSecret);
  console.log('Refresh:', !!refreshToken);

  try {
    const token = await getDropboxAccessToken(appKey, appSecret, refreshToken);
    console.log('Successfully got token:', !!token);

    await prisma.integration.update({
      where: { id: dbx.id },
      data: { status: 'ACTIVE' }
    });
    console.log('Updated to ACTIVE in DB!');
  } catch (e) {
    console.error(e);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
