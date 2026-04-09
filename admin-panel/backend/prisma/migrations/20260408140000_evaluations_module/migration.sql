-- CreateEnum
CREATE TYPE "EvaluationTemplateType" AS ENUM ('CLIENT', 'AUDIT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "EvaluationQuestionType" AS ENUM ('RATING', 'NPS', 'BOOLEAN', 'TEXT', 'MULTIPLE_CHOICE');

-- CreateEnum
CREATE TYPE "EvaluationInstanceStatus" AS ENUM ('PENDING', 'RESPONDED', 'IN_REVIEW', 'FINALIZED');

-- CreateEnum
CREATE TYPE "EvaluationClassification" AS ENUM ('EXCELLENT', 'GOOD', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EvaluationDisputeStatus" AS ENUM ('PENDING', 'MAINTAIN_EVAL', 'ADJUSTED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "EvaluationActionPlanStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "EvaluationTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EvaluationTemplateType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggerRules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationTemplateQuestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "EvaluationQuestionType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB,
    "categoryKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EvaluationTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationInstance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "executionId" TEXT,
    "technicianUserId" TEXT NOT NULL,
    "status" "EvaluationInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "displayText" TEXT,
    "rawClientText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResponse" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "EvaluationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationScore" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "scoreByCategory" JSONB NOT NULL,
    "classification" "EvaluationClassification" NOT NULL,

    CONSTRAINT "EvaluationScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationAcknowledgement" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationInternalNote" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationInternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationActionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "technicianUserId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "EvaluationActionPlanStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationDispute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "technicianUserId" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "EvaluationDisputeStatus" NOT NULL DEFAULT 'PENDING',
    "supervisorId" TEXT,
    "resolutionNote" TEXT,
    "adjustedTotalScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationDispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvaluationTemplate_tenantId_active_idx" ON "EvaluationTemplate"("tenantId", "active");

CREATE INDEX "EvaluationTemplateQuestion_templateId_idx" ON "EvaluationTemplateQuestion"("templateId");

CREATE UNIQUE INDEX "EvaluationInstance_idempotencyKey_key" ON "EvaluationInstance"("idempotencyKey");

CREATE INDEX "EvaluationInstance_tenantId_technicianUserId_createdAt_idx" ON "EvaluationInstance"("tenantId", "technicianUserId", "createdAt");

CREATE INDEX "EvaluationInstance_executionId_idx" ON "EvaluationInstance"("executionId");

CREATE INDEX "EvaluationResponse_instanceId_idx" ON "EvaluationResponse"("instanceId");

CREATE UNIQUE INDEX "EvaluationResponse_instanceId_questionId_key" ON "EvaluationResponse"("instanceId", "questionId");

CREATE UNIQUE INDEX "EvaluationScore_instanceId_key" ON "EvaluationScore"("instanceId");

CREATE UNIQUE INDEX "EvaluationAcknowledgement_instanceId_userId_key" ON "EvaluationAcknowledgement"("instanceId", "userId");

CREATE INDEX "EvaluationInternalNote_instanceId_idx" ON "EvaluationInternalNote"("instanceId");

CREATE INDEX "EvaluationActionPlan_instanceId_idx" ON "EvaluationActionPlan"("instanceId");

CREATE INDEX "EvaluationActionPlan_tenantId_idx" ON "EvaluationActionPlan"("tenantId");

CREATE INDEX "EvaluationDispute_tenantId_status_idx" ON "EvaluationDispute"("tenantId", "status");

CREATE INDEX "EvaluationDispute_instanceId_idx" ON "EvaluationDispute"("instanceId");

ALTER TABLE "EvaluationTemplate" ADD CONSTRAINT "EvaluationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationTemplateQuestion" ADD CONSTRAINT "EvaluationTemplateQuestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationInstance" ADD CONSTRAINT "EvaluationInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationInstance" ADD CONSTRAINT "EvaluationInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EvaluationInstance" ADD CONSTRAINT "EvaluationInstance_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ChecklistExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EvaluationInstance" ADD CONSTRAINT "EvaluationInstance_technicianUserId_fkey" FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationResponse" ADD CONSTRAINT "EvaluationResponse_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EvaluationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationResponse" ADD CONSTRAINT "EvaluationResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EvaluationTemplateQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EvaluationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationAcknowledgement" ADD CONSTRAINT "EvaluationAcknowledgement_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EvaluationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationAcknowledgement" ADD CONSTRAINT "EvaluationAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationInternalNote" ADD CONSTRAINT "EvaluationInternalNote_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EvaluationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationInternalNote" ADD CONSTRAINT "EvaluationInternalNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationActionPlan" ADD CONSTRAINT "EvaluationActionPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationActionPlan" ADD CONSTRAINT "EvaluationActionPlan_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EvaluationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationActionPlan" ADD CONSTRAINT "EvaluationActionPlan_technicianUserId_fkey" FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationDispute" ADD CONSTRAINT "EvaluationDispute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationDispute" ADD CONSTRAINT "EvaluationDispute_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "EvaluationInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationDispute" ADD CONSTRAINT "EvaluationDispute_technicianUserId_fkey" FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationDispute" ADD CONSTRAINT "EvaluationDispute_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
