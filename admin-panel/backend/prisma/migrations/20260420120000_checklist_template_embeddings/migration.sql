-- Embeddings para RAG semântico da biblioteca de formulários (Composer).
CREATE TABLE "ChecklistTemplateEmbedding" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dims" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplateEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChecklistTemplateEmbedding_templateId_key" ON "ChecklistTemplateEmbedding"("templateId");

CREATE INDEX "ChecklistTemplateEmbedding_templateId_idx" ON "ChecklistTemplateEmbedding"("templateId");

ALTER TABLE "ChecklistTemplateEmbedding" ADD CONSTRAINT "ChecklistTemplateEmbedding_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
