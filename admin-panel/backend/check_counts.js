const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const tenants = await prisma.tenant.count();
  const users = await prisma.user.count();
  console.log(`Tenants: ${tenants}, Users: ${users}`);
  process.exit();
}
check();
