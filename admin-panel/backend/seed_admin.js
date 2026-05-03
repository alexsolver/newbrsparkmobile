/**
 * APENAS desenvolvimento / demo — credencial fraca fixa. Não usar em produção nem expor esta BD.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const email = 'admin@brspark.com';
  const password = await bcrypt.hash('admin123', 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { password },
    create: { email, password, name: 'Administrador Demo' },
  });
  console.log('Admin account ready:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
