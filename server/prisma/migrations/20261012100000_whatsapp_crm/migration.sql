CREATE TABLE "WhatsAppCrmContact" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "automationId" TEXT,
  "waId" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "company" TEXT,
  "city" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'new',
  "source" TEXT NOT NULL DEFAULT 'whatsapp',
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "customFields" JSONB,
  "optedOut" BOOLEAN NOT NULL DEFAULT false,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCrmContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppCrmContact_workspaceId_waId_key" ON "WhatsAppCrmContact"("workspaceId", "waId");
CREATE INDEX "WhatsAppCrmContact_workspaceId_stage_idx" ON "WhatsAppCrmContact"("workspaceId", "stage");
ALTER TABLE "WhatsAppCrmContact" ADD CONSTRAINT "WhatsAppCrmContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppCrmActivity" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdBy" TEXT NOT NULL DEFAULT 'ai',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppCrmActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppCrmActivity_contactId_createdAt_idx" ON "WhatsAppCrmActivity"("contactId", "createdAt");
ALTER TABLE "WhatsAppCrmActivity" ADD CONSTRAINT "WhatsAppCrmActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WhatsAppCrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppCrmTask" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'followup',
  "dueAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdBy" TEXT NOT NULL DEFAULT 'ai',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCrmTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppCrmTask_workspaceId_status_dueAt_idx" ON "WhatsAppCrmTask"("workspaceId", "status", "dueAt");
CREATE INDEX "WhatsAppCrmTask_contactId_idx" ON "WhatsAppCrmTask"("contactId");
ALTER TABLE "WhatsAppCrmTask" ADD CONSTRAINT "WhatsAppCrmTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCrmTask" ADD CONSTRAINT "WhatsAppCrmTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WhatsAppCrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppCrmDeal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "value" DOUBLE PRECISION,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'open',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'ai',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCrmDeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppCrmDeal_workspaceId_status_idx" ON "WhatsAppCrmDeal"("workspaceId", "status");
CREATE INDEX "WhatsAppCrmDeal_contactId_idx" ON "WhatsAppCrmDeal"("contactId");
ALTER TABLE "WhatsAppCrmDeal" ADD CONSTRAINT "WhatsAppCrmDeal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppCrmDeal" ADD CONSTRAINT "WhatsAppCrmDeal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WhatsAppCrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
