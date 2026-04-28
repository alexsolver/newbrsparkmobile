-- Remove tipo legado PARTNER: passa a DEDICATED (único vínculo prestador–empresa).
UPDATE "ProviderTenantAffiliation"
SET "relationshipType" = 'DEDICATED'
WHERE UPPER(TRIM("relationshipType")) = 'PARTNER';

ALTER TABLE "ProviderTenantAffiliation" ALTER COLUMN "relationshipType" SET DEFAULT 'DEDICATED';
