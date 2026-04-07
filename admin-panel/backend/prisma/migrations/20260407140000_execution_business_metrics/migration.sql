-- Métricas derivadas (PDF / painel) para relatórios, auditoria e gatilhos de negócio.
ALTER TABLE "ChecklistExecution" ADD COLUMN "businessMetrics" JSONB;
ALTER TABLE "ChecklistExecutionRevision" ADD COLUMN "businessMetrics" JSONB;
