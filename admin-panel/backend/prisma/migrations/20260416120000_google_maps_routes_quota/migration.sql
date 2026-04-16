-- Quotas Google Maps (Routes): contagem mensal por tenant + limite no plano
ALTER TABLE "TenantPlanUsagePeriod" ADD COLUMN "googleMapsRouteCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Plan" ADD COLUMN "quotaGoogleMapsRoutesPerMonth" INTEGER NOT NULL DEFAULT -1;
