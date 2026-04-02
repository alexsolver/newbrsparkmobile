const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'luigi@lansolver.com' } });
  if (!user) {
    console.log("User not found!");
    return;
  }
  console.log("User tenantId:", user.tenantId);
  const assets = await prisma.asset.findMany({ where: { tenantId: user.tenantId } });
  console.log("Assets under tenant:", assets.length, assets.map(a => ({ id: a.id, title: a.title, deletedAt: a.deletedAt })));
  
  // also check all assets recently created
  const recent = await prisma.asset.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
  console.log("Recent assets globally:", recent.map(r => ({ id: r.id, title: r.title, tenantId: r.tenantId, deletedAt: r.deletedAt })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
