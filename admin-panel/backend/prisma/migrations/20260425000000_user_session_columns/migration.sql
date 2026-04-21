-- Colunas em schema.prisma sem migration histórica (drift com desenvolvimento local).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentSessionId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentDeviceId" TEXT;
