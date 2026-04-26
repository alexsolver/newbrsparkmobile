-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "laravel_tenant_id" TEXT;

CREATE UNIQUE INDEX "Tenant_laravel_tenant_id_key" ON "Tenant"("laravel_tenant_id");
