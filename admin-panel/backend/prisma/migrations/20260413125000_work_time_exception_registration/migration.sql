-- Registo por exceção: justificativa + snapshot de validações (GPS, endereço, face, dispositivo).
ALTER TABLE "WorkTimePunch" ADD COLUMN "exceptionRegistration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkTimePunch" ADD COLUMN "exceptionJustification" TEXT;
ALTER TABLE "WorkTimePunch" ADD COLUMN "validationSnapshot" JSONB;
