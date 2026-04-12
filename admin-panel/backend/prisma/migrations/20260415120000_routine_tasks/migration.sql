-- Tarefas de rotina (RT): numeração global por tenant, mês civil America/Sao_Paulo (RT-AAAA-MM-NNNNNN)
CREATE TABLE "RtSerialCounter" (
    "periodKey" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RtSerialCounter_pkey" PRIMARY KEY ("periodKey")
);

ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "routineTaskNumber" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ChecklistExecution_routineTaskNumber_key"
  ON "ChecklistExecution" ("routineTaskNumber")
  WHERE "routineTaskNumber" IS NOT NULL;

CREATE TABLE "RoutineTaskAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoutineTaskAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RoutineTaskAssignment_userId_templateId_key"
  ON "RoutineTaskAssignment"("userId", "templateId");

CREATE INDEX "RoutineTaskAssignment_tenantId_idx" ON "RoutineTaskAssignment"("tenantId");
CREATE INDEX "RoutineTaskAssignment_userId_idx" ON "RoutineTaskAssignment"("userId");

ALTER TABLE "RoutineTaskAssignment" ADD CONSTRAINT "RoutineTaskAssignment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoutineTaskAssignment" ADD CONSTRAINT "RoutineTaskAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoutineTaskAssignment" ADD CONSTRAINT "RoutineTaskAssignment_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
