-- Notas internas do painel (suporte / operações), texto longo opcional
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "admin_internal_notes" TEXT;
