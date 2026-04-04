/**
 * Dev utility: prints the Dropbox integration row from the database.
 * Run from admin-panel/backend: node scripts/check_dropbox.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dbx = await prisma.integration.findFirst({
    where: { name: 'Dropbox' }
  });
  console.log(dbx);
}
main().catch(console.error).finally(() => prisma.$disconnect());
