-- CreateTable
CREATE TABLE "app_accounts" (
    "id" TEXT NOT NULL,
    "email_norm" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_accounts_email_norm_key" ON "app_accounts"("email_norm");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "app_account_id" TEXT;

-- CreateIndex
CREATE INDEX "User_app_account_id_idx" ON "User"("app_account_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_app_account_id_fkey" FOREIGN KEY ("app_account_id") REFERENCES "app_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: uma AppAccount por e-mail (hash do utilizador mais antigo do grupo).
INSERT INTO "app_accounts" ("id", "email_norm", "password", "createdAt", "updatedAt")
SELECT
    replace((gen_random_uuid()::text || gen_random_uuid()::text), '-', ''),
    LOWER(TRIM("email")),
    (array_agg("password" ORDER BY "createdAt" ASC))[1],
    NOW(),
    NOW()
FROM "User"
WHERE "email" IS NOT NULL AND TRIM("email") <> ''
GROUP BY LOWER(TRIM("email"));

UPDATE "User" u
SET "app_account_id" = a."id"
FROM "app_accounts" a
WHERE LOWER(TRIM(u."email")) = a."email_norm";

-- Alinhar palavras-passe locais ao hash canónico da conta (mesmo valor, mantém bcrypt.compare nos User).
UPDATE "User" u
SET "password" = a."password"
FROM "app_accounts" a
WHERE u."app_account_id" = a."id";

-- Papéis fixos por tipo de tenant (CLIENT = USER; PROVIDER = PROVIDER).
UPDATE "User" u
SET "role" = 'USER'::"UserRole"
FROM "Tenant" t
WHERE u."tenantId" = t."id" AND t."kind" = 'CLIENT' AND u."role"::text <> 'USER';

UPDATE "User" u
SET "role" = 'PROVIDER'::"UserRole"
FROM "Tenant" t
WHERE u."tenantId" = t."id" AND t."kind" = 'PROVIDER' AND u."role"::text <> 'PROVIDER';
