const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const users = await prisma.user.findMany({ select: { email: true, name: true, avatarUrl: true } });
  console.log(users.filter(u => u.avatarUrl));
}
run().finally(() => prisma.$disconnect());
