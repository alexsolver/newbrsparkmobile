-- Public client survey link + moderation / insights JSON
ALTER TABLE "EvaluationInstance" ADD COLUMN IF NOT EXISTS "publicToken" TEXT;
ALTER TABLE "EvaluationInstance" ADD COLUMN IF NOT EXISTS "publicTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "EvaluationInstance" ADD COLUMN IF NOT EXISTS "moderationMeta" JSONB;
ALTER TABLE "EvaluationInstance" ADD COLUMN IF NOT EXISTS "insights" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "EvaluationInstance_publicToken_key" ON "EvaluationInstance"("publicToken");
