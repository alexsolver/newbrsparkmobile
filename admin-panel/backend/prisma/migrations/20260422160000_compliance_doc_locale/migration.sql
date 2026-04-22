-- AlterTable: locale por documento legal (app + admin)
ALTER TABLE "ComplianceDoc" ADD COLUMN IF NOT EXISTS "locale" TEXT NOT NULL DEFAULT 'pt-BR';
UPDATE "ComplianceDoc" SET "locale" = 'pt-BR' WHERE "locale" IS NULL OR TRIM("locale") = '';
