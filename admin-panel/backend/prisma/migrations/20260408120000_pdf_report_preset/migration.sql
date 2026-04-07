-- CreateTable
CREATE TABLE "PdfReportPreset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "config" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfReportPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfReportPreset_tenantId_idx" ON "PdfReportPreset"("tenantId");
