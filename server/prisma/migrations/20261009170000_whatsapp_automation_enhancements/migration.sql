-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Message counters on WhatsAppAutomationSession
ALTER TABLE "WhatsAppAutomationSession"
  ADD COLUMN IF NOT EXISTS "messagesSent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "messagesReceived" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "messagesFailed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "llmCalls" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "toolCalls" INTEGER NOT NULL DEFAULT 0;

-- WhatsAppAutomationLog table
CREATE TABLE IF NOT EXISTS "WhatsAppAutomationLog" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "automationId" TEXT NOT NULL,
  "connectionId" TEXT,
  "contactWaId" TEXT,
  "sessionId" TEXT,
  "level" TEXT NOT NULL DEFAULT 'info',
  "category" TEXT NOT NULL DEFAULT 'system',
  "event" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppAutomationLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppAutomationLog_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppAutomationLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppAutomationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WhatsAppAutomationLog_automationId_createdAt_idx" ON "WhatsAppAutomationLog"("automationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppAutomationLog_automationId_category_idx" ON "WhatsAppAutomationLog"("automationId", "category");
CREATE INDEX IF NOT EXISTS "WhatsAppAutomationLog_sessionId_createdAt_idx" ON "WhatsAppAutomationLog"("sessionId", "createdAt");

-- WhatsAppAutoReplyRule table
CREATE TABLE IF NOT EXISTS "WhatsAppAutoReplyRule" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "automationId" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "triggerKey" TEXT,
  "triggerValue" TEXT,
  "matchMode" TEXT NOT NULL DEFAULT 'exact',
  "response" TEXT NOT NULL,
  "responseType" TEXT NOT NULL DEFAULT 'text',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppAutoReplyRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppAutoReplyRule_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppAutoReplyRule_automationId_triggerType_triggerKey_key" UNIQUE ("automationId", "triggerType", "triggerKey")
);

CREATE INDEX IF NOT EXISTS "WhatsAppAutoReplyRule_automationId_enabled_idx" ON "WhatsAppAutoReplyRule"("automationId", "enabled");