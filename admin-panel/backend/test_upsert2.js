const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'luigi@lansolver.com' } });
  if (!user) return console.log("User not found!");
  
  const tenantId = user.tenantId;

  const newAsset = {
    id: "brsp-123456",
    title: "Test Luigi Console",
    type: "TERRESTRIAL",
    status: 'OPERACIONAL',
    statusType: 'success',
    parentId: null,
    imageUrl: undefined,
    details: {
      inventoryId: '', brand: '', model: '', serialNumber: '',
      costCenter: '', acquisitionValue: '',
      cep: '', street: '', streetNumber: '', complement: '', neighborhood: '', city: '', state: '',
      gpsCoordinates: '', owner: '', department: '', customFields: [], photos: [],
      customIcon: undefined, customColor: undefined,
    }
  };

  const p = newAsset;

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
    console.log("Upsert Success!", asset.id);
  } catch (err) {
    console.error("Upsert Error:", err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
