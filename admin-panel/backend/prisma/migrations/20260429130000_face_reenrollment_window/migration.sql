-- Janela temporária para o prestador (app) atualizar avatar + fotos base FaceMatch sem desbloquear documento/BI.
ALTER TABLE "TechnicianProfile" ADD COLUMN IF NOT EXISTS "face_reenrollment_until" TIMESTAMP(3);
ALTER TABLE "TechnicianProfile" ADD COLUMN IF NOT EXISTS "face_reenrollment_note" TEXT;
