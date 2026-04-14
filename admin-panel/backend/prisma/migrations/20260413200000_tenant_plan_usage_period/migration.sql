-- Consumo mensal por tenant (quotas do plano de assinatura)
CREATE TABLE "TenantPlanUsagePeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "aiFacialCount" INTEGER NOT NULL DEFAULT 0,
    "aiVisionDetectionCount" INTEGER NOT NULL DEFAULT 0,
    "aiVisionAnalysisCount" INTEGER NOT NULL DEFAULT 0,
    "fieldTasksCount" INTEGER NOT NULL DEFAULT 0,
    "routineTasksCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPlanUsagePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPlanUsagePeriod_tenantId_periodKey_key" ON "TenantPlanUsagePeriod"("tenantId", "periodKey");
CREATE INDEX "TenantPlanUsagePeriod_tenantId_idx" ON "TenantPlanUsagePeriod"("tenantId");

ALTER TABLE "TenantPlanUsagePeriod" ADD CONSTRAINT "TenantPlanUsagePeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
