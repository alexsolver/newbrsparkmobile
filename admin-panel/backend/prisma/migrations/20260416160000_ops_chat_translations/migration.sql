-- Traduções em cache para o chat operacional (mesmo modelo que o chat corporativo)
ALTER TABLE "checklist_execution_ops_chat_messages" ADD COLUMN "translations" JSONB;
