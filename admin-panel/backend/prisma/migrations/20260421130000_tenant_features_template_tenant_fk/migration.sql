-- JSON de extensões por tenant (moderação do chat de tracking, etc.)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "features" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ChecklistTemplate" DROP CONSTRAINT IF EXISTS "ChecklistTemplate_tenantId_fkey";
ALTER TABLE "ChecklistTemplate"
  ADD CONSTRAINT "ChecklistTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
