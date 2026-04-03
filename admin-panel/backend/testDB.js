const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const reqs = await prisma.checklistExecution.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, status: true, locationLat: true, locationLng: true, etaMinutes: true, locationZoneType: true, locationPolygon: true }
  });
  console.log(JSON.stringify(reqs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
