-- Estado persistido da sincronização FaceMatch (Recognition) por utilizador
ALTER TABLE "User" ADD COLUMN "comprefaceRecognitionSync" JSONB;
