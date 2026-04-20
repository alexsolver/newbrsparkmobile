-- Bibliotecas de referência (catálogo por tenant) para integrações e pré-carga de dados.
CREATE TABLE "ReferenceLibrary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxImageEdgePx" INTEGER NOT NULL DEFAULT 768,
    "imageQuality" INTEGER NOT NULL DEFAULT 80,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceLibrary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferenceLibrary_tenantId_idx" ON "ReferenceLibrary"("tenantId");

ALTER TABLE "ReferenceLibrary" ADD CONSTRAINT "ReferenceLibrary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReferenceLibraryField" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReferenceLibraryField_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferenceLibraryField_libraryId_idx" ON "ReferenceLibraryField"("libraryId");

CREATE UNIQUE INDEX "ReferenceLibraryField_libraryId_key_key" ON "ReferenceLibraryField"("libraryId", "key");

ALTER TABLE "ReferenceLibraryField" ADD CONSTRAINT "ReferenceLibraryField_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "ReferenceLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReferenceLibraryRow" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceLibraryRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferenceLibraryRow_libraryId_externalKey_key" ON "ReferenceLibraryRow"("libraryId", "externalKey");

CREATE INDEX "ReferenceLibraryRow_libraryId_updatedAt_idx" ON "ReferenceLibraryRow"("libraryId", "updatedAt");

ALTER TABLE "ReferenceLibraryRow" ADD CONSTRAINT "ReferenceLibraryRow_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "ReferenceLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
