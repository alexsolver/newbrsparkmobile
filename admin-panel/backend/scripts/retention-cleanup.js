/**
 * retention-cleanup.js — BrSpark Data Retention Cleanup
 *
 * Executar via cron diário:
 *   node scripts/retention-cleanup.js
 *
 * Ou via cron no servidor:
 *   0 3 * * * node /app/scripts/retention-cleanup.js >> /var/log/brspark-retention.log 2>&1
 */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const now = new Date();
  console.log(`[RETENTION] 🧹 Iniciando limpeza em ${now.toISOString()}`);

  // ── 1. TelemetryEvent expirados ─────────────────────────────────────────────
  const expiredTelemetry = await prisma.telemetryEvent.deleteMany({
    where: {
      expiresAt: { lt: now },
      retentionTier: { in: ['RAW_SHORT', 'OPERATIONAL'] }, // nunca deleta LEGAL/PERMANENT
    },
  });
  console.log(`[RETENTION] ✅ TelemetryEvent expirados removidos: ${expiredTelemetry.count}`);

  // ── 2. ConsentRecord revogados há mais de 2 anos ────────────────────────────
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const expiredConsents = await prisma.consentRecord.deleteMany({
    where: { revokedAt: { lt: twoYearsAgo } },
  });
  console.log(`[RETENTION] ✅ ConsentRecord expirados removidos: ${expiredConsents.count}`);

  // ── 3. AuditLog antigos (> 2 anos, categoria não-crítica) ──────────────────
  const auditCutoff = new Date(now);
  auditCutoff.setFullYear(auditCutoff.getFullYear() - 2);
  const expiredAudit = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: auditCutoff },
      category: { in: ['SYSTEM'] }, // apenas logs de sistema; nunca remove AUTH/DATA/ADMIN
    },
  });
  console.log(`[RETENTION] ✅ AuditLog SYSTEM expirados removidos: ${expiredAudit.count}`);

  console.log(`[RETENTION] 🏁 Limpeza concluída em ${new Date().toISOString()}`);
  await prisma.$disconnect();
}

run().catch(e => {
  console.error('[RETENTION] ❌ Erro:', e.message);
  process.exit(1);
});
