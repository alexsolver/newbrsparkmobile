const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'alex@brspark.com';
  
  // Coordenadas base (Centro de SP, por exemplo)
  const baseLat = -23.5505; 
  const baseLng = -46.6333;
  
  // Vamos criar 5 cenários combinando distância e vencimento
  const tasks = [
    { name: "OS-01 (Muito Perto, Vence Amanhã)", lat: baseLat + 0.001, lng: baseLng + 0.001, dueHours: +24, status: 'PENDING' },
    { name: "OS-02 (Médio, Vence Hoje)", lat: baseLat + 0.005, lng: baseLng + 0.005, dueHours: +8, status: 'PENDING' },
    { name: "OS-03 (Longe, ATRASADA Crítica)", lat: baseLat + 0.05, lng: baseLng + 0.05, dueHours: -2, status: 'PENDING' }, // Overdue
    { name: "OS-04 (Muito Longe, Vence daqui a 1 hora)", lat: baseLat + 0.1, lng: baseLng + 0.1, dueHours: +1, status: 'PENDING' },
    { name: "OS-05 (Mais Longe, Vence em 3 Dias)", lat: baseLat + 0.15, lng: baseLng + 0.15, dueHours: +72, status: 'PENDING' },
  ];

  for (let t of tasks) {
    const dueDate = new Date(Date.now() + t.dueHours * 3600000).toISOString();
    
    await prisma.checklistExecution.create({
      data: {
        ownerEmail: email,
        status: t.status,
        locationLat: t.lat,
        locationLng: t.lng,
        locationAddress: `Local Simulado - ${t.name}`,
        metadata: {
          title: t.name,
          icon: "navigate-circle",
          dueDate: dueDate
        }
      }
    });
  }
  console.log("✅ 5 atendimentos de teste para Rota+SLA criados com sucesso!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
