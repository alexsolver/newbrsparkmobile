-- Add relationship type + end timestamp for provider tenant affiliations

ALTER TABLE "ProviderTenantAffiliation"
  ADD COLUMN "relationshipType" TEXT NOT NULL DEFAULT 'PARTNER',
  ADD COLUMN "endedAt" TIMESTAMP(3);

CREATE INDEX "ProviderTenantAffiliation_providerIdentityId_relationshipType_idx"
  ON "ProviderTenantAffiliation" ("providerIdentityId", "relationshipType");

