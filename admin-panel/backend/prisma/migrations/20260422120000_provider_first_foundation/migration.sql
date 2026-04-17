-- Foundation: provider-first network (global identity + tenant affiliations)

CREATE TABLE "ProviderIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "globalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "kycReviewedAt" TIMESTAMP(3),
  "kycReviewNote" TEXT,
  "score" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  "cft" TEXT,
  "specialty" TEXT,
  "skillsJson" JSONB,
  "profileJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderIdentity_userId_key" ON "ProviderIdentity"("userId");

ALTER TABLE "ProviderIdentity"
  ADD CONSTRAINT "ProviderIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProviderTenantAffiliation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "providerIdentityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INVITED',
  "invitationToken" TEXT,
  "invitedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3),
  "invitedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "note" TEXT,
  "tenantScheduleJson" JSONB,
  "tenantServiceLocationIds" JSONB,
  "tenantDocsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderTenantAffiliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderTenantAffiliation_invitationToken_key" ON "ProviderTenantAffiliation"("invitationToken");
CREATE UNIQUE INDEX "ProviderTenantAffiliation_tenantId_providerIdentityId_key" ON "ProviderTenantAffiliation"("tenantId", "providerIdentityId");
CREATE INDEX "ProviderTenantAffiliation_tenantId_status_idx" ON "ProviderTenantAffiliation"("tenantId", "status");
CREATE INDEX "ProviderTenantAffiliation_providerIdentityId_status_idx" ON "ProviderTenantAffiliation"("providerIdentityId", "status");

ALTER TABLE "ProviderTenantAffiliation"
  ADD CONSTRAINT "ProviderTenantAffiliation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProviderTenantAffiliation"
  ADD CONSTRAINT "ProviderTenantAffiliation_providerIdentityId_fkey"
  FOREIGN KEY ("providerIdentityId") REFERENCES "ProviderIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProviderOnboardingApplication" (
  "id" TEXT NOT NULL,
  "providerIdentityId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "inviteToken" TEXT,
  "responsesJson" JSONB NOT NULL DEFAULT '{}',
  "revisionNote" TEXT,
  "submittedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderOnboardingApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderOnboardingApplication_inviteToken_key" ON "ProviderOnboardingApplication"("inviteToken");
CREATE INDEX "ProviderOnboardingApplication_providerIdentityId_status_idx" ON "ProviderOnboardingApplication"("providerIdentityId", "status");

ALTER TABLE "ProviderOnboardingApplication"
  ADD CONSTRAINT "ProviderOnboardingApplication_providerIdentityId_fkey"
  FOREIGN KEY ("providerIdentityId") REFERENCES "ProviderIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
