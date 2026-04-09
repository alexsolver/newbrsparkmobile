'use strict';

/**
 * Prestador habilitado = User ativo com TechnicianProfile.status ACTIVE.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @param {string} [tenantId] — se definido, restringe ao tenant (ex.: formulário do painel)
 * @returns {Promise<boolean>}
 */
async function isActiveTechnicianForEmail(prisma, email, tenantId) {
  const e = String(email || '').trim();
  if (!e) return false;
  const where = {
    isActive: true,
    email: { equals: e, mode: 'insensitive' },
    technicianProfile: { status: 'ACTIVE' },
  };
  if (tenantId) where.tenantId = tenantId;
  const row = await prisma.user.findFirst({ where, select: { id: true } });
  return !!row;
}

module.exports = { isActiveTechnicianForEmail };
