-- Despacho tipo Uber: vários técnicos; primeiro POST /claim ganha a OS.
ALTER TABLE "ChecklistExecution" ALTER COLUMN "ownerEmail" DROP NOT NULL;

ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "assignmentMode" TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "claimStatus" TEXT;
ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "broadcastCandidates" JSONB;
ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "claimedByUserId" TEXT;
ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ChecklistExecution_assignmentMode_claimStatus_idx"
  ON "ChecklistExecution" ("assignmentMode", "claimStatus");
