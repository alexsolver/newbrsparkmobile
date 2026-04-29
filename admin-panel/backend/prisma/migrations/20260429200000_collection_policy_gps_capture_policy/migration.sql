-- Política de captura GPS na coleta de dados (CollectionPolicy), não mais em WorkTimeSettings.

ALTER TABLE "CollectionPolicy" ADD COLUMN IF NOT EXISTS "gpsCapturePolicy" JSONB;

UPDATE "CollectionPolicy" AS p
SET "gpsCapturePolicy" = w."gpsCapturePolicy"
FROM "WorkTimeSettings" AS w
WHERE p."tenantId" IS NOT NULL
  AND w."tenantId" = p."tenantId";

ALTER TABLE "WorkTimeSettings" DROP COLUMN IF EXISTS "gpsCapturePolicy";
