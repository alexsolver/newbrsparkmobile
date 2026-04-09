-- Estado persistido da sincronização CompreFace (Recognition) por utilizador
ALTER TABLE "User" ADD COLUMN "comprefaceRecognitionSync" JSONB;
