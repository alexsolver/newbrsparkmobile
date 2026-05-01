-- Justificativa e actor em rescisão/suspensão de vínculo prestador-empresa
ALTER TABLE "ProviderTenantAffiliation"
  ADD COLUMN IF NOT EXISTS "transition_justification" TEXT,
  ADD COLUMN IF NOT EXISTS "transition_actor" TEXT;
