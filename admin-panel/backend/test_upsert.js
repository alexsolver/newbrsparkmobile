const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'luigi@lansolver.com' } });
  if (!user) return console.log("User not found!");
  
  const tenantId = user.tenantId;
  const p = {
    id: "brsp-" + Math.random().toString().substring(2, 8),
    title: "Test Asset Luigi",
    type: "TERRESTRIAL",
    status: "OPERACIONAL",
    imageUrl: null,
    parentId: null,
    details: { brand: "Teste" }
  };

  try {
    const asset = await prisma.asset.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        tenantId,
        title:    p.title,
        type:     p.type || 'OTHER',
        status:   p.status || 'OPERACIONAL',
        imageUrl: p.imageUrl || null,
        parentId: p.parentId || null,
        metadata: p.details || {},
      },
      update: {
        title:    p.title,
        status:   p.status,
        imageUrl: p.imageUrl || null,
        parentId: p.parentId || null,
        metadata: p.details || {},
      },
    });
    console.log("Upsert Success!", asset);
  } catch (err) {
    console.error("Upsert Error:", err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
