-- Fotos base para reconhecimento facial (painel admin)
ALTER TABLE "User" ADD COLUMN "faceEnrollmentPhotos" JSONB;
