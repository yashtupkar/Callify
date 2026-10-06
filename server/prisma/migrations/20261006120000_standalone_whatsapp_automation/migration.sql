CREATE TABLE "WhatsAppAutomation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "language" TEXT DEFAULT 'en-US',
  "supportedLanguages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "systemPrompt" TEXT NOT NULL DEFAULT '',
  "initialMessage" TEXT,
  "businessName" TEXT,
  "timezone" TEXT DEFAULT 'Asia/Kolkata',
  "promptConfig" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppAutomation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppConnection" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "phoneNumberId" TEXT,
  "businessId" TEXT,
  "instanceId" TEXT,
  "apiToken" TEXT,
  "verifyToken" TEXT,
  "appSecret" TEXT,
  "credentials" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppAutomationTool" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "schema" JSONB NOT NULL,
  "config" JSONB,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppAutomationTool_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WhatsAppAutomationSession" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "contactWaId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "transcript" JSONB,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppAutomationSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppAutomation_automation_phone_key" ON "WhatsAppConnection"("automationId", "phoneNumber");
CREATE UNIQUE INDEX "WhatsAppAutomationTool_automation_name_key" ON "WhatsAppAutomationTool"("automationId", "name");
CREATE UNIQUE INDEX "WhatsAppAutomationSession_connection_contact_key" ON "WhatsAppAutomationSession"("connectionId", "contactWaId");
CREATE INDEX "WhatsAppAutomation_workspace_status_idx" ON "WhatsAppAutomation"("workspaceId", "status");
CREATE INDEX "WhatsAppConnection_provider_enabled_idx" ON "WhatsAppConnection"("provider", "enabled");
CREATE INDEX "WhatsAppAutomationSession_automation_status_idx" ON "WhatsAppAutomationSession"("automationId", "status");
ALTER TABLE "WhatsAppAutomation" ADD CONSTRAINT "WhatsAppAutomation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAutomationTool" ADD CONSTRAINT "WhatsAppAutomationTool_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAutomationSession" ADD CONSTRAINT "WhatsAppAutomationSession_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppAutomationSession" ADD CONSTRAINT "WhatsAppAutomationSession_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
