'use strict';

/**
 * Remove faces/subjects no FaceMatch para todos os User com isActive=false na base de dados.
 * Útil após migrações ou antes de ativar a limpeza automática nas rotas.
 *
 * Uso (na pasta admin-panel/backend):
 *   node scripts/compreface-prune-inactive-users-gallery.js
 *   node scripts/compreface-prune-inactive-users-gallery.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const { removeComprefaceGalleryForUser } = require('../src/lib/comprefaceRemoveUserGallery');

async function main() {
  const dry = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.user.findMany({
      where: { isActive: false },
      select: { id: true, tenantId: true, email: true },
    });
    console.log(`Utilizadores inativos: ${rows.length}${dry ? ' (dry-run)' : ''}`);
    let ok = 0;
    let fail = 0;
    for (const u of rows) {
      if (dry) {
        console.log(`  [dry-run] tenant=${u.tenantId} id=${u.id} ${u.email}`);
        continue;
      }
      const r = await removeComprefaceGalleryForUser(prisma, u.tenantId, u.id, {
        reason: 'Limpeza em lote (utilizador inativo).',
      });
      if (r.ok) {
        ok += 1;
        console.log(`  OK subject=${r.subject} id=${u.id}`);
      } else {
        fail += 1;
        console.warn(`  SKIP/FAIL id=${u.id}: ${r.error || '?'}`);
      }
    }
    if (!dry) console.log(`Concluído: ${ok} OK, ${fail} falhas/sem integração.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
