-- AlterTable
ALTER TABLE "ChecklistExecution" ADD COLUMN "lastSubmittedRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ChecklistExecutionRevision" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "responses" JSONB NOT NULL,
    "metadataSnapshot" JSONB,
    "completedAt" TIMESTAMP(3),
    "submissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistExecutionRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChecklistExecutionRevision_executionId_revision_key" ON "ChecklistExecutionRevision"("executionId", "revision");

CREATE UNIQUE INDEX "ChecklistExecutionRevision_submissionId_key" ON "ChecklistExecutionRevision"("submissionId");

CREATE INDEX "ChecklistExecutionRevision_executionId_idx" ON "ChecklistExecutionRevision"("executionId");

ALTER TABLE "ChecklistExecutionRevision" ADD CONSTRAINT "ChecklistExecutionRevision_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: uma revisão por execução já concluída (histórico antes do versionamento)
INSERT INTO "ChecklistExecutionRevision" ("id", "executionId", "revision", "responses", "metadataSnapshot", "completedAt", "createdAt")
SELECT gen_random_uuid()::text, e."id", 1, COALESCE(e."responses", '{}'::jsonb), e."metadata", e."completedAt", NOW()
FROM "ChecklistExecution" e
WHERE e."status" IN ('COMPLETED', 'SYNCED');

UPDATE "ChecklistExecution" e
SET "lastSubmittedRevision" = 1
WHERE EXISTS (
  SELECT 1 FROM "ChecklistExecutionRevision" r WHERE r."executionId" = e."id" AND r."revision" = 1
);
