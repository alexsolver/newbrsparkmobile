-- Preferência de idioma para tradução no chat + cache de traduções por mensagem
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferred_chat_locale" TEXT;

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "translations" JSONB;
