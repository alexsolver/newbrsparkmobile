-- Aparência e mensagens da pesquisa pública (evaluation-survey.html)
ALTER TABLE "EvaluationTemplate" ADD COLUMN "surveyLogoUrl" TEXT;
ALTER TABLE "EvaluationTemplate" ADD COLUMN "surveyMessagePre" TEXT;
ALTER TABLE "EvaluationTemplate" ADD COLUMN "surveyMessagePost" TEXT;
