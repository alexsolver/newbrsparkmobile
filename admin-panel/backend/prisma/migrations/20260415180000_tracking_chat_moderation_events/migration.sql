-- Moderação do chat de acompanhamento (auditoria).
-- TTL: apagar linhas com created_at < now() - interval 'N days' (operacional; job agendado recomendado).

CREATE TABLE "tracking_chat_moderation_events" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "actor_role" TEXT NOT NULL,
    "text_hash" TEXT NOT NULL,
    "text_length" INTEGER NOT NULL,
    "text_preview" VARCHAR(200),
    "category" TEXT,
    "severity" TEXT,
    "confidence" DOUBLE PRECISION,
    "prefilter_json" JSONB,
    "ia_json" JSONB,
    "final_action" TEXT NOT NULL,
    "stage_at_time" TEXT,
    "needs_human_review" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracking_chat_moderation_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tracking_chat_moderation_events_execution_id_created_at_idx"
  ON "tracking_chat_moderation_events"("execution_id", "created_at");

CREATE INDEX "tracking_chat_moderation_events_tenant_id_created_at_idx"
  ON "tracking_chat_moderation_events"("tenant_id", "created_at");

CREATE INDEX "tracking_chat_moderation_events_needs_human_review_created_at_idx"
  ON "tracking_chat_moderation_events"("needs_human_review", "created_at");

ALTER TABLE "tracking_chat_moderation_events"
  ADD CONSTRAINT "tracking_chat_moderation_events_execution_id_fkey"
  FOREIGN KEY ("execution_id") REFERENCES "ChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
