-- CreateTable
CREATE TABLE "TechnicianRegistrationApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inviteToken" TEXT NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "revisionNote" TEXT,
    "responsesJson" JSONB NOT NULL DEFAULT '{}',
    "passwordHash" TEXT,
    "createdUserId" TEXT,
    "createdByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicianRegistrationApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianRegistrationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianRegistrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianRegistrationApplication_inviteToken_key" ON "TechnicianRegistrationApplication"("inviteToken");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicianRegistrationApplication_createdUserId_key" ON "TechnicianRegistrationApplication"("createdUserId");

-- CreateIndex
CREATE INDEX "TechnicianRegistrationApplication_tenantId_status_idx" ON "TechnicianRegistrationApplication"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TechnicianRegistrationApplication_invitedEmail_tenantId_idx" ON "TechnicianRegistrationApplication"("invitedEmail", "tenantId");

-- CreateIndex
CREATE INDEX "TechnicianRegistrationEvent_applicationId_createdAt_idx" ON "TechnicianRegistrationEvent"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "TechnicianRegistrationApplication" ADD CONSTRAINT "TechnicianRegistrationApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianRegistrationApplication" ADD CONSTRAINT "TechnicianRegistrationApplication_createdUserId_fkey" FOREIGN KEY ("createdUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianRegistrationEvent" ADD CONSTRAINT "TechnicianRegistrationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "TechnicianRegistrationApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
