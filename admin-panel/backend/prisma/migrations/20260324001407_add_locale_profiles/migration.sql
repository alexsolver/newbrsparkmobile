/*
  Warnings:

  - You are about to drop the column `isConnected` on the `Integration` table. All the data in the column will be lost.
  - You are about to drop the column `logoUrl` on the `Tenant` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ownerName` to the `Tenant` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Integration" DROP COLUMN "isConnected",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Tenant" DROP COLUMN "logoUrl",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "localeId" TEXT,
ADD COLUMN     "ownerName" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "LocaleProfile" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "currencySymbol" TEXT NOT NULL DEFAULT 'R$',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "numberFormat" TEXT NOT NULL DEFAULT 'PT_STYLE',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "taxIdLabel" TEXT NOT NULL DEFAULT 'Tax ID',
    "postalCodeLabel" TEXT NOT NULL DEFAULT 'Postal Code',
    "measureSystem" TEXT NOT NULL DEFAULT 'METRIC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocaleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "photo" TEXT,
    "tags" JSONB,
    "keywords" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT NOT NULL DEFAULT 'SP',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocaleProfile_countryCode_key" ON "LocaleProfile"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_localeId_fkey" FOREIGN KEY ("localeId") REFERENCES "LocaleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
