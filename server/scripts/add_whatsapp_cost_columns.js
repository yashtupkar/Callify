require('dotenv').config();
const { dbService } = require('../src/services/DatabaseService');

async function migrate() {
  try {
    await dbService.prisma.$executeRawUnsafe(`
      ALTER TABLE "WhatsAppAutomationSession" 
      ADD COLUMN IF NOT EXISTS "llmCost" DOUBLE PRECISION DEFAULT 0.0,
      ADD COLUMN IF NOT EXISTS "llmPromptTokens" INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "llmCompletionTokens" INTEGER DEFAULT 0;
    `);
    console.log('Columns llmCost, llmPromptTokens, llmCompletionTokens added/verified on WhatsAppAutomationSession!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await dbService.disconnect();
  }
}

migrate();
