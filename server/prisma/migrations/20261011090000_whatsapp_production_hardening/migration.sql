-- Fail loudly (with a clear message) if existing rows would violate the new unique keys.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "WhatsAppConnection" WHERE "phoneNumberId" IS NOT NULL GROUP BY "phoneNumberId" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate WhatsAppConnection.phoneNumberId values exist; resolve them before migrating';
  END IF;
  IF EXISTS (SELECT 1 FROM "WhatsAppConnection" WHERE "instanceId" IS NOT NULL GROUP BY "instanceId" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate WhatsAppConnection.instanceId values exist; resolve them before migrating';
  END IF;
END $$;

CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumberId_key" ON "WhatsAppConnection"("phoneNumberId");
CREATE UNIQUE INDEX "WhatsAppConnection_instanceId_key" ON "WhatsAppConnection"("instanceId");

CREATE TABLE "WhatsAppInboundMessage" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "contactWaId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppInboundMessage_connectionId_providerMessageId_key" ON "WhatsAppInboundMessage"("connectionId", "providerMessageId");
CREATE INDEX "WhatsAppInboundMessage_status_updatedAt_idx" ON "WhatsAppInboundMessage"("status", "updatedAt");
CREATE INDEX "WhatsAppInboundMessage_connectionId_contactWaId_createdAt_idx" ON "WhatsAppInboundMessage"("connectionId", "contactWaId", "createdAt");

ALTER TABLE "WhatsAppInboundMessage" ADD CONSTRAINT "WhatsAppInboundMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
