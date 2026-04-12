'use strict';

/**
 * Garante colunas do chat/tradução alinhadas ao schema Prisma atual.
 * Evita login quebrado quando `prisma migrate deploy` ainda não foi executado no ambiente.
 * Idempotente (ADD COLUMN IF NOT EXISTS). PostgreSQL 11+.
 *
 * Preferível continuar a aplicar migrações oficiais: `npm run db:migrate` em admin-panel/backend.
 */
async function ensureChatLocaleSchema(prisma) {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferred_chat_locale" TEXT;',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "translations" JSONB;',
  );
}

module.exports = { ensureChatLocaleSchema };
