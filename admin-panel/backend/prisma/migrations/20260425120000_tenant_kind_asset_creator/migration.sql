-- TenantKind + visibilidade por tipo de organização + criador do ativo

CREATE TYPE "TenantKind" AS ENUM ('COMPANY', 'CLIENT', 'PROVIDER');

ALTER TABLE "Tenant" ADD COLUMN "kind" "TenantKind" NOT NULL DEFAULT 'COMPANY';

ALTER TABLE "Asset" ADD COLUMN "created_by_user_id" TEXT;

CREATE INDEX "Asset_tenantId_created_by_user_id_idx" ON "Asset"("tenantId", "created_by_user_id");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
