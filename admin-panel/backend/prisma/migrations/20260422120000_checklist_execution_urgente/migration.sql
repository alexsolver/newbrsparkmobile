-- Prioridade «Urgente» definida no despacho da OS (painel).
ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "urgente" BOOLEAN NOT NULL DEFAULT false;
