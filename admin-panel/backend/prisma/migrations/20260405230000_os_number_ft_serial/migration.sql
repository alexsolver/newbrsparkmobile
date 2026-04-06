-- CreateTable
CREATE TABLE "OsSerialCounter" (
    "periodKey" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OsSerialCounter_pkey" PRIMARY KEY ("periodKey")
);

-- AlterTable
ALTER TABLE "ChecklistExecution" ADD COLUMN "osNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistExecution_osNumber_key" ON "ChecklistExecution"("osNumber");
