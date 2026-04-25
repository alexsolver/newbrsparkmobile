-- Verificação em duas etapas (OTP por e-mail) no login e no perfil do app.
ALTER TABLE "User" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
