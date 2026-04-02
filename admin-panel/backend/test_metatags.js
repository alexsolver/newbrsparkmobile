const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const metatags = await prisma.metatag.findMany({ where: { type: 'ASSET_TYPE' } });
  console.log("ASSET_TYPES tags:", metatags.map(m => m.key));
}

main().catch(console.error).finally(() => prisma.$disconnect());
