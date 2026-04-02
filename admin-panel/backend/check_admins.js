const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const admins = await prisma.admin.findMany();
  console.log('Admins list:', admins.map(a => a.email));
  process.exit();
}
check();
