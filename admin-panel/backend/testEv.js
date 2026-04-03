const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const evs = await prisma.telemetryEvent.findMany({
    orderBy: { serverTimestamp: 'desc' },
    take: 5
  });
  console.log(evs);
}
main().catch(console.error).finally(() => prisma.$disconnect());
