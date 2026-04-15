-- Verificação de e-mail (painel: enviar link; público: confirmar token).
ALTER TABLE "User" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "email_verification_token" TEXT,
ADD COLUMN     "email_verification_expires_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_email_verification_token_key" ON "User"("email_verification_token");
