const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findFirst();
  const token = jwt.sign(
    { id: user.id, tenantId: user.tenantId, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const res = await fetch('http://localhost:3001/api/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ avatarUrl: 'SUCCESS' })
  });
  
  const text = await res.text();
  console.log('Status:', res.status, 'Body:', text);
}
run().finally(() => prisma.$disconnect());
