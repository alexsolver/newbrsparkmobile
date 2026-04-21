-- Onboarding técnico: OTP, termos, KYC refs, tabela de desafio OTP
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "terms_version" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone_verified_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platform_contract_url" TEXT;

ALTER TABLE "ProviderIdentity" ADD COLUMN IF NOT EXISTS "kyc_provider" TEXT;
ALTER TABLE "ProviderIdentity" ADD COLUMN IF NOT EXISTS "kyc_external_id" TEXT;

CREATE TABLE IF NOT EXISTS "OtpLoginChallenge" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "userId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "metadataJson" JSONB,
    CONSTRAINT "OtpLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OtpLoginChallenge_target_purpose_createdAt_idx" ON "OtpLoginChallenge"("target", "purpose", "createdAt");
CREATE INDEX IF NOT EXISTS "OtpLoginChallenge_expiresAt_idx" ON "OtpLoginChallenge"("expiresAt");
