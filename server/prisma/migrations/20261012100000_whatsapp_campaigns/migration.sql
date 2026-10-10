-- Users belong to a workspace. Existing users are attached to the oldest workspace, which is the
-- workspace the application already resolved for them before this column existed.
ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT;
UPDATE "User" SET "workspaceId" = (SELECT "id" FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1) WHERE "workspaceId" IS NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppCampaign" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "connectionId" TEXT,
  "createdById" TEXT,
  "idempotencyKey" TEXT,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "statusNote" TEXT,
  "templateName" TEXT,
  "templateLanguage" TEXT,
  "templateSnapshot" JSONB,
  "messageText" TEXT,
  "variableMap" JSONB,
  "headerMediaUrl" TEXT,
  "defaultCountryCode" TEXT,
  "concurrency" INTEGER NOT NULL DEFAULT 2,
  "ratePerMinute" INTEGER NOT NULL DEFAULT 30,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "dailyLimit" INTEGER,
  "optInConfirmedAt" TIMESTAMP(3),
  "optInConfirmedBy" TEXT,
  "optInSource" TEXT,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "launchedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppCampaignRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "phone" TEXT,
  "rawPhone" TEXT,
  "name" TEXT,
  "variables" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "skipReason" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lockedUntil" TIMESTAMP(3),
  "sendStartedAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "queuedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppCampaignStatusEvent" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppCampaignStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppOptOut" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppOptOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppCampaign_workspaceId_idempotencyKey_key" ON "WhatsAppCampaign"("workspaceId", "idempotencyKey");
CREATE INDEX "WhatsAppCampaign_workspaceId_createdAt_idx" ON "WhatsAppCampaign"("workspaceId", "createdAt");
CREATE INDEX "WhatsAppCampaign_status_idx" ON "WhatsAppCampaign"("status");
CREATE INDEX "WhatsAppCampaign_connectionId_idx" ON "WhatsAppCampaign"("connectionId");
CREATE UNIQUE INDEX "WhatsAppCampaignRecipient_campaignId_phone_key" ON "WhatsAppCampaignRecipient"("campaignId", "phone");
CREATE UNIQUE INDEX "WhatsAppCampaignRecipient_providerMessageId_key" ON "WhatsAppCampaignRecipient"("providerMessageId");
CREATE INDEX "WhatsAppCampaignRecipient_campaignId_status_idx" ON "WhatsAppCampaignRecipient"("campaignId", "status");
CREATE INDEX "WhatsAppCampaignRecipient_status_nextAttemptAt_idx" ON "WhatsAppCampaignRecipient"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "WhatsAppCampaignStatusEvent_providerMessageId_key" ON "WhatsAppCampaignStatusEvent"("providerMessageId");
CREATE INDEX "WhatsAppCampaignStatusEvent_createdAt_idx" ON "WhatsAppCampaignStatusEvent"("createdAt");
CREATE UNIQUE INDEX "WhatsAppOptOut_workspaceId_phone_key" ON "WhatsAppOptOut"("workspaceId", "phone");

ALTER TABLE "WhatsAppCampaign" ADD CONSTRAINT "WhatsAppCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCampaign" ADD CONSTRAINT "WhatsAppCampaign_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCampaignRecipient" ADD CONSTRAINT "WhatsAppCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "WhatsAppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppOptOut" ADD CONSTRAINT "WhatsAppOptOut_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
