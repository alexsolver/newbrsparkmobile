-- CreateEnum
CREATE TYPE "WorkTimeBrazilRegime" AS ENUM ('CLT', 'PJ');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "work_time_brazil_regime" "WorkTimeBrazilRegime";
