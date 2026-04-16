-- Chat operacional por execução (thread gestor ↔ técnico por FT/RT)
CREATE TABLE "checklist_execution_ops_chat_messages" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "sender_email" TEXT NOT NULL,
    "sender_kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_execution_ops_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "checklist_execution_ops_chat_messages_execution_id_created_at_idx"
    ON "checklist_execution_ops_chat_messages"("execution_id", "created_at");

ALTER TABLE "checklist_execution_ops_chat_messages"
    ADD CONSTRAINT "checklist_execution_ops_chat_messages_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "ChecklistExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
