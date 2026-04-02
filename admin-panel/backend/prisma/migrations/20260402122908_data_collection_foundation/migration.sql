-- CreateEnum
CREATE TYPE "TelemetryEventType" AS ENUM ('SESSION_OPEN', 'SESSION_CLOSE', 'OS_ACCEPT', 'OS_START', 'CHECKIN', 'CHECKOUT', 'TRANSIT_START', 'TRANSIT_END', 'HEARTBEAT', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT', 'PAUSE', 'RESUME', 'FRAUD_FLAG', 'INTEGRITY_CHECK', 'POLICY_VIOLATION');

-- AlterTable
ALTER TABLE "AssetShare" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ComplianceDoc" ADD COLUMN     "sectorCode" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "sectorCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE "ChatContact" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "avatarColor" TEXT DEFAULT '#2563EB',
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "creatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT,
    "mediaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "settings" JSONB NOT NULL,
    "schemaData" JSONB NOT NULL,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistExecution" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "assetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "responses" JSONB,
    "metadata" JSONB,
    "locationAddress" TEXT,
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationRadius" INTEGER,
    "locationZoneType" TEXT,
    "locationPolygon" JSONB,
    "gpsLocation" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "sectorCode" TEXT,
    "label" TEXT NOT NULL DEFAULT 'Padrão',
    "locationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "locationBackgroundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "locationIntervalIdleMin" INTEGER NOT NULL DEFAULT 30,
    "locationIntervalTransitMin" INTEGER NOT NULL DEFAULT 2,
    "locationIntervalOnSiteMin" INTEGER NOT NULL DEFAULT 5,
    "locationDistanceFilterMeters" INTEGER NOT NULL DEFAULT 200,
    "retentionGpsRawDays" INTEGER NOT NULL DEFAULT 15,
    "retentionEventsYears" INTEGER NOT NULL DEFAULT 5,
    "retentionAuditDays" INTEGER NOT NULL DEFAULT 180,
    "retentionMetricsDays" INTEGER NOT NULL DEFAULT 730,
    "mockGpsAction" TEXT NOT NULL DEFAULT 'WARN',
    "rootJailbreakAction" TEXT NOT NULL DEFAULT 'WARN',
    "clockDriftMaxSeconds" INTEGER NOT NULL DEFAULT 300,
    "requireExplicitConsent" BOOLEAN NOT NULL DEFAULT true,
    "consentGranular" BOOLEAN NOT NULL DEFAULT true,
    "legalBasis" TEXT NOT NULL DEFAULT 'LGPD',
    "requireCheckinPhoto" BOOLEAN NOT NULL DEFAULT false,
    "allowOfflineCheckin" BOOLEAN NOT NULL DEFAULT true,
    "minOnSiteMinutes" INTEGER NOT NULL DEFAULT 0,
    "outOfPolicyAction" TEXT NOT NULL DEFAULT 'PROCEED_FLAG',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "deviceId" TEXT,
    "executionId" TEXT,
    "eventType" "TelemetryEventType" NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "locationSource" TEXT,
    "batteryLevel" DOUBLE PRECISION,
    "batteryCharging" BOOLEAN,
    "networkType" TEXT,
    "appVersion" TEXT,
    "osVersion" TEXT,
    "deviceModel" TEXT,
    "isMockLocation" BOOLEAN NOT NULL DEFAULT false,
    "isRooted" BOOLEAN NOT NULL DEFAULT false,
    "clockDriftMs" INTEGER,
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceTimestamp" TIMESTAMP(3),
    "payload" JSONB,
    "retentionTier" TEXT NOT NULL DEFAULT 'OPERATIONAL',
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionMetric" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "executionId" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "transitDurationMin" INTEGER,
    "siteArrivalDelayMin" INTEGER,
    "onSiteDurationMin" INTEGER,
    "idleTimeMin" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "geofenceBreaches" INTEGER NOT NULL DEFAULT 0,
    "routeDeviationMaxMeters" INTEGER,
    "scoreExecution" INTEGER,
    "scoreReliability" INTEGER,
    "scoreRisk" INTEGER,
    "fraudFlags" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'BATCH',

    CONSTRAINT "ExecutionMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "policyId" TEXT,
    "docId" TEXT,
    "consentType" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatContact_requesterId_addresseeId_key" ON "ChatContact"("requesterId", "addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoomMember_roomId_userId_key" ON "ChatRoomMember"("roomId", "userId");

-- CreateIndex
CREATE INDEX "ChecklistExecution_ownerEmail_idx" ON "ChecklistExecution"("ownerEmail");

-- CreateIndex
CREATE INDEX "ChecklistExecution_status_idx" ON "ChecklistExecution"("status");

-- CreateIndex
CREATE INDEX "ChecklistExecution_ownerEmail_status_idx" ON "ChecklistExecution"("ownerEmail", "status");

-- CreateIndex
CREATE INDEX "CollectionPolicy_tenantId_idx" ON "CollectionPolicy"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPolicy_tenantId_sectorCode_key" ON "CollectionPolicy"("tenantId", "sectorCode");

-- CreateIndex
CREATE INDEX "TelemetryEvent_tenantId_eventType_serverTimestamp_idx" ON "TelemetryEvent"("tenantId", "eventType", "serverTimestamp");

-- CreateIndex
CREATE INDEX "TelemetryEvent_ownerEmail_serverTimestamp_idx" ON "TelemetryEvent"("ownerEmail", "serverTimestamp");

-- CreateIndex
CREATE INDEX "TelemetryEvent_executionId_idx" ON "TelemetryEvent"("executionId");

-- CreateIndex
CREATE INDEX "TelemetryEvent_expiresAt_idx" ON "TelemetryEvent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionMetric_executionId_key" ON "ExecutionMetric"("executionId");

-- CreateIndex
CREATE INDEX "ExecutionMetric_tenantId_ownerEmail_idx" ON "ExecutionMetric"("tenantId", "ownerEmail");

-- CreateIndex
CREATE INDEX "ExecutionMetric_executionId_idx" ON "ExecutionMetric"("executionId");

-- CreateIndex
CREATE INDEX "ConsentRecord_ownerEmail_idx" ON "ConsentRecord"("ownerEmail");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_idx" ON "ConsentRecord"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_ownerEmail_policyId_consentType_key" ON "ConsentRecord"("ownerEmail", "policyId", "consentType");

-- AddForeignKey
ALTER TABLE "ComplianceDoc" ADD CONSTRAINT "ComplianceDoc_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistExecution" ADD CONSTRAINT "ChecklistExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPolicy" ADD CONSTRAINT "CollectionPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "CollectionPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_docId_fkey" FOREIGN KEY ("docId") REFERENCES "ComplianceDoc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
