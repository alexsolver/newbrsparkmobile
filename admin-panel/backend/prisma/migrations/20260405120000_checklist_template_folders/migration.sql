-- Pastas para organizar modelos de checklist no Form Builder (admin)

CREATE TABLE "ChecklistTemplateFolder" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplateFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChecklistTemplateFolder_parentId_idx" ON "ChecklistTemplateFolder"("parentId");

ALTER TABLE "ChecklistTemplateFolder" ADD CONSTRAINT "ChecklistTemplateFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChecklistTemplateFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChecklistTemplate" ADD COLUMN "folderId" TEXT;

CREATE INDEX "ChecklistTemplate_folderId_idx" ON "ChecklistTemplate"("folderId");

ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ChecklistTemplateFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
