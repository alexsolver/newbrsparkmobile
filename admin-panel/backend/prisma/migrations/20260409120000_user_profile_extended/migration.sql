-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "addressJson" JSONB;
ALTER TABLE "User" ADD COLUMN "personalDocuments" JSONB;

-- AlterTable
ALTER TABLE "TechnicianProfile" ADD COLUMN "workScheduleJson" JSONB;
ALTER TABLE "TechnicianProfile" ADD COLUMN "skillsJson" JSONB;
ALTER TABLE "TechnicianProfile" ADD COLUMN "serviceLocationIds" JSONB;
ALTER TABLE "TechnicianProfile" ADD COLUMN "professionalDocuments" JSONB;
