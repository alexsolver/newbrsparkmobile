-- AlterTable
ALTER TABLE "TechnicianRegistrationApplication" ADD COLUMN "candidateUserId" TEXT;

-- AddForeignKey
ALTER TABLE "TechnicianRegistrationApplication" ADD CONSTRAINT "TechnicianRegistrationApplication_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
