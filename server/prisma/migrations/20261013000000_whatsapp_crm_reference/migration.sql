-- Add reference column to WhatsAppCrmTask for user-facing status lookups
ALTER TABLE "WhatsAppCrmTask" ADD COLUMN "reference" TEXT;

-- Index for fast lookup by reference code
CREATE UNIQUE INDEX "WhatsAppCrmTask_reference_key" ON "WhatsAppCrmTask"("reference") WHERE "reference" IS NOT NULL;
