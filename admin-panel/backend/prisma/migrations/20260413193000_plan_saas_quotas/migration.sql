-- Cotas por plano (assinatura SaaS): técnicos, IA, FT/RT, formulários
ALTER TABLE "Plan" ADD COLUMN "maxTechnicians" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Plan" ADD COLUMN "quotaAiFacialPerMonth" INTEGER NOT NULL DEFAULT -1;
ALTER TABLE "Plan" ADD COLUMN "quotaAiVisionDetectionPerMonth" INTEGER NOT NULL DEFAULT -1;
ALTER TABLE "Plan" ADD COLUMN "quotaAiVisionAnalysisPerMonth" INTEGER NOT NULL DEFAULT -1;
ALTER TABLE "Plan" ADD COLUMN "quotaFieldTasksMonthly" INTEGER NOT NULL DEFAULT -1;
ALTER TABLE "Plan" ADD COLUMN "quotaRoutineTasksMonthly" INTEGER NOT NULL DEFAULT -1;
ALTER TABLE "Plan" ADD COLUMN "maxChecklistTemplates" INTEGER NOT NULL DEFAULT -1;

-- Alinhar técnicos ao limite de utilizadores já existente (quando faz sentido)
UPDATE "Plan" SET "maxTechnicians" = CASE WHEN "maxUsers" < 0 THEN -1 ELSE "maxUsers" END
WHERE "maxTechnicians" = 5;
