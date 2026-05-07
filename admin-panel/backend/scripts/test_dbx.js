/**
 * Dev utility: test Dropbox refresh-token flow using credentials from the integration row.
 * Run from admin-panel/backend: node scripts/test_dbx.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  resolveDropboxRefreshToken,
  getDropboxAccessToken,
} = require('../src/lib/dropboxOAuth');

async function main() {
  const dbx = await prisma.integration.findFirst({
    where: { name: 'Dropbox' }
  });

  if (!dbx) return console.log('Not found');

  const [appKey, ...secretParts] = (dbx.apiKey || '').split(':');
  const appSecret = secretParts.join(':');
  const refreshToken = resolveDropboxRefreshToken(dbx);

  console.log('AppKey:', appKey);
  console.log('AppSecret:', appSecret);
  console.log('Refresh:', !!refreshToken);
  if (!refreshToken) return console.error('Sem refresh_token na description (esperado refresh_token:...)');

  try {
    const token = await getDropboxAccessToken(appKey.trim(), appSecret.trim(), refreshToken);
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
