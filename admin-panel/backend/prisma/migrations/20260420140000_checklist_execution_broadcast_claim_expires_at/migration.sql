-- Prazo de aceite da oferta (modo broadcast / primeiro a aceitar) — integrações e app.
ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "broadcast_claim_expires_at" TIMESTAMP(3);
