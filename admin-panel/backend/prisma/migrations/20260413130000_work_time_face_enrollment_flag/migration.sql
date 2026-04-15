-- Batidas: marca quando a matrícula facial (fotos base + FaceMatch sincronizado) não estava válida no momento do registo.
ALTER TABLE "WorkTimePunch" ADD COLUMN "faceEnrollmentInvalid" BOOLEAN NOT NULL DEFAULT false;

-- Remove opção de bloquear batida sem matrícula; o registo é sempre aceite e a batida pode levar a flag acima.
ALTER TABLE "WorkTimeSettings" DROP COLUMN IF EXISTS "blockPunchIfFaceNotEnrolled";
