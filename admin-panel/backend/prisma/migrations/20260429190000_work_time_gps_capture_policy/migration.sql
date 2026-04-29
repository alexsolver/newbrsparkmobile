-- AlterTable (gpsCapturePolicy; timestamp após migrações já aplicadas em alguns ambientes)
ALTER TABLE "WorkTimeSettings" ADD COLUMN IF NOT EXISTS "gpsCapturePolicy" JSONB NOT NULL DEFAULT '{}';
