-- 1. Rename tables
ALTER TABLE "WhatsAppCrmContact" RENAME TO "AutomationContact";
ALTER TABLE "WhatsAppCrmActivity" RENAME TO "AutomationActivity";

-- We migrate WhatsAppCrmTask and WhatsAppCrmDeal into a single generic AutomationRecord table
CREATE TABLE "AutomationRecord" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "fields" JSONB,
    "dueDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AutomationRecord_reference_key" ON "AutomationRecord"("reference");
CREATE INDEX "AutomationRecord_automationId_type_status_idx" ON "AutomationRecord"("automationId", "type", "status");
CREATE INDEX "AutomationRecord_contactId_idx" ON "AutomationRecord"("contactId");
ALTER TABLE "AutomationRecord" ADD CONSTRAINT "AutomationRecord_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRecord" ADD CONSTRAINT "AutomationRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AutomationContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate data
INSERT INTO "AutomationRecord" ("id", "automationId", "contactId", "type", "title", "reference", "status", "dueDate", "createdBy", "createdAt", "updatedAt")
SELECT 
    t."id", 
    c."automationId", 
    t."contactId", 
    t."kind", 
    t."title", 
    COALESCE(t."reference", 'REF-' || t."id"), 
    t."status", 
    t."dueAt", 
    t."createdBy", 
    t."createdAt", 
    t."updatedAt"
FROM "WhatsAppCrmTask" t
JOIN "AutomationContact" c ON t."contactId" = c."id"
WHERE c."automationId" IS NOT NULL;

-- 2. Drop old tables
DROP TABLE "WhatsAppCrmTask" CASCADE;
DROP TABLE "WhatsAppCrmDeal" CASCADE;

-- 3. Modify AutomationContact constraints
-- Before making automationId NOT NULL, let's delete orphans or set a default.
DELETE FROM "AutomationContact" WHERE "automationId" IS NULL;
ALTER TABLE "AutomationContact" DROP CONSTRAINT IF EXISTS "WhatsAppCrmContact_workspaceId_fkey";
ALTER TABLE "AutomationContact" DROP COLUMN "workspaceId";
ALTER TABLE "AutomationContact" ALTER COLUMN "automationId" SET NOT NULL;
