-- CreateTable
CREATE TABLE "UserModuleData" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserModuleData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserModuleData_ownerEmail_idx" ON "UserModuleData"("ownerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "UserModuleData_ownerEmail_module_key" ON "UserModuleData"("ownerEmail", "module");
