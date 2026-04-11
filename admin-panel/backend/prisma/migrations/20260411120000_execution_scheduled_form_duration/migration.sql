-- Início planejado na agenda + snapshot do tempo previsto de execução do formulário (min), múltiplos de 5.
ALTER TABLE "ChecklistExecution" ADD COLUMN "scheduled_start_at" TIMESTAMP(3);
ALTER TABLE "ChecklistExecution" ADD COLUMN "expected_form_duration_minutes" INTEGER;
