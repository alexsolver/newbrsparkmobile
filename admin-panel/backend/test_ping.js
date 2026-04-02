const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.checklistExecution.findFirst({ orderBy: { createdAt: 'desc' } })
  .then(async (e) => {
     if(!e) return console.log('No OS');
     console.log('Patching OS:', e.id);
     const fetch = require('node-fetch');
     const res = await fetch('http://localhost:3001/api/checklists/executions/' + e.id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACCEPTED' })
     });
     console.log('Response:', res.status);
     
     const updated = await prisma.checklistExecution.findUnique({ where: { id: e.id } });
     console.log('Updated Metadata:', updated.metadata);
  })
  .finally(() => prisma.$disconnect());
