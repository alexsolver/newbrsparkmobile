-- Histórico de versões dos modelos de checklist (Form Builder)

CREATE TABLE "ChecklistTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "settings" JSONB NOT NULL,
    "schemaData" JSONB NOT NULL,
    "metadata" JSONB,
    "folderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "ChecklistTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChecklistTemplateVersion_templateId_createdAt_idx"
    ON "ChecklistTemplateVersion"("templateId", "createdAt");

CREATE INDEX "ChecklistTemplateVersion_templateId_version_idx"
    ON "ChecklistTemplateVersion"("templateId", "version");

ALTER TABLE "ChecklistTemplateVersion"
    ADD CONSTRAINT "ChecklistTemplateVersion_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ChecklistTemplateVersion" (
    "id",
    "templateId",
    "version",
    "title",
    "description",
    "settings",
    "schemaData",
    "metadata",
    "folderId",
    "isActive",
    "changeNote",
    "createdAt"
)
SELECT
    CONCAT("id", '_v', COALESCE("version", 1)),
    "id",
    COALESCE("version", 1),
    "title",
    "description",
    "settings",
    "schemaData",
    "metadata",
    "folderId",
    "isActive",
    'Snapshot inicial migrado do modelo atual',
    "updatedAt"
FROM "ChecklistTemplate";
