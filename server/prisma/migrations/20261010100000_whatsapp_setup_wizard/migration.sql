ALTER TABLE "WhatsAppAutomation"
  ADD COLUMN IF NOT EXISTS "businessPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "businessEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "industry" TEXT,
  ADD COLUMN IF NOT EXISTS "address" TEXT,
  ADD COLUMN IF NOT EXISTS "fallbackMode" TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS "fallbackMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "handoffMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "handoffKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "tone" TEXT DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS "responseLength" TEXT DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS "setupStep" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "behaviorConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "capabilities" JSONB;

ALTER TABLE "WhatsAppAutoReplyRule"
  ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT 'Auto-reply',
  ADD COLUMN IF NOT EXISTS "responseConfig" JSONB;

CREATE TABLE IF NOT EXISTS "WhatsAppKnowledgeSource" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "automationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT,
  "sourceUrl" TEXT,
  "fileName" TEXT,
  "mimeType" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppKnowledgeSource_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppKnowledgeSource_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WhatsAppKnowledgeSource_automationId_enabled_idx" ON "WhatsAppKnowledgeSource"("automationId", "enabled");

CREATE TABLE IF NOT EXISTS "WhatsAppProduct" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "automationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "price" TEXT,
  "imageUrl" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppProduct_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppProduct_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WhatsAppProduct_automationId_enabled_idx" ON "WhatsAppProduct"("automationId", "enabled");

CREATE TABLE IF NOT EXISTS "WhatsAppFaq" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "automationId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppFaq_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppFaq_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WhatsAppFaq_automationId_enabled_priority_idx" ON "WhatsAppFaq"("automationId", "enabled", "priority");

CREATE TABLE IF NOT EXISTS "WhatsAppBusinessHour" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "automationId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "openTime" TEXT,
  "closeTime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppBusinessHour_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppBusinessHour_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "WhatsAppAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppBusinessHour_automationId_dayOfWeek_key" UNIQUE ("automationId", "dayOfWeek")
);
