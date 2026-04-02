const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'luigi@lansolver.com' } });
  if (!user) return console.log("User not found!");
  
  const audits = await prisma.auditLog.findMany({ 
    where: { tenantId: user.tenantId, action: 'SYNC_PUSH' },
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log("Recent sync pushes:", audits);
}

main().catch(console.error).finally(() => prisma.$disconnect());
