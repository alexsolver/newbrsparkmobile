-- CreateEnum
CREATE TYPE "WorkTimePunchType" AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "WorkTimePunchSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'ERROR');

-- CreateTable
CREATE TABLE "WorkTimeSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "requireFaceOnEveryPunch" BOOLEAN NOT NULL DEFAULT true,
    "requireGpsOnEveryPunch" BOOLEAN NOT NULL DEFAULT true,
    "requireResolvedAddress" BOOLEAN NOT NULL DEFAULT true,
    "maxClockDriftSeconds" INTEGER NOT NULL DEFAULT 300,
    "minGpsAccuracyMeters" INTEGER,
    "blockPunchIfFaceNotEnrolled" BOOLEAN NOT NULL DEFAULT true,
    "employeeNoticeMarkdown" TEXT,
    "consentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTimeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTimePunch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "WorkTimePunchType" NOT NULL,
    "deviceTimestamp" TIMESTAMP(3) NOT NULL,
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "formattedAddress" TEXT,
    "addressResolvedAt" TIMESTAMP(3),
    "faceVerificationId" TEXT,
    "faceScore" DOUBLE PRECISION,
    "faceEngine" TEXT,
    "syncStatus" "WorkTimePunchSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTimePunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkTimeSettings_tenantId_key" ON "WorkTimeSettings"("tenantId");

-- CreateIndex
CREATE INDEX "WorkTimePunch_tenantId_userId_deviceTimestamp_idx" ON "WorkTimePunch"("tenantId", "userId", "deviceTimestamp");

-- CreateIndex
CREATE INDEX "WorkTimePunch_userId_createdAt_idx" ON "WorkTimePunch"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkTimeSettings" ADD CONSTRAINT "WorkTimeSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTimePunch" ADD CONSTRAINT "WorkTimePunch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTimePunch" ADD CONSTRAINT "WorkTimePunch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "workTimeTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "workTimeEnrolledAt" TIMESTAMP(3);
