-- Feed iCal público (token) por ativo — ocupação para importar no Airbnb / calendários externos
CREATE TABLE "AssetOccupancyCalendarFeed" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetOccupancyCalendarFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssetOccupancyCalendarFeed_token_key" ON "AssetOccupancyCalendarFeed"("token");

CREATE UNIQUE INDEX "AssetOccupancyCalendarFeed_ownerEmail_assetId_key" ON "AssetOccupancyCalendarFeed"("ownerEmail", "assetId");

CREATE INDEX "AssetOccupancyCalendarFeed_ownerEmail_idx" ON "AssetOccupancyCalendarFeed"("ownerEmail");

CREATE INDEX "AssetOccupancyCalendarFeed_assetId_idx" ON "AssetOccupancyCalendarFeed"("assetId");
