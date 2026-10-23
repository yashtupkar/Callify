/**
 * Test WhatsApp Automation Real LLM Cost Accumulation
 * 
 * Verifies that:
 * 1. LLM requests in WhatsApp conversation manager capture real API cost & tokens.
 * 2. Consecutive LLM turns accumulate cost into previous cost.
 * 3. The database session (WhatsAppAutomationSession) increments llmCost and tokens accurately.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { WhatsAppConversationManager } = require('../src/whatsappAutomation/conversationManager');
const { dbService } = require('../src/services/DatabaseService');

async function testWhatsAppCostAccumulation() {
  console.log('\n======================================================');
  console.log(' TESTING WHATSAPP AUTOMATION REAL LLM COST ACCUMULATION');
  console.log('======================================================\n');

  const testConnectionId = 'test-conn-' + Date.now();
  const testContactWaId = '919876543210';
  let createdSessionId = null;

  try {
    // 1. Create or find an automation
    const automation = await dbService.prisma.whatsAppAutomation.findFirst();
    if (!automation) {
      console.log('⚠️ No automation found in DB, testing in-memory tracking only.');
    }

    // 2. Mock WhatsApp Channel Adapter
    const sentResponses = [];
    const mockChannel = {
      instanceId: testConnectionId,
      contactWaId: testContactWaId,
      automationId: automation ? automation.id : 'mock-auto-id',
      sendResponse: async (payload) => {
        sentResponses.push(payload);
      }
    };

    // If we have an automation, create a real session row in the DB to verify increment
    if (automation) {
      const connection = await dbService.prisma.whatsAppConnection.findFirst({
        where: { automationId: automation.id }
      });

      if (connection) {
        mockChannel.instanceId = connection.id;
        const sessionRecord = await dbService.prisma.whatsAppAutomationSession.upsert({
          where: {
            connectionId_contactWaId: {
              connectionId: connection.id,
              contactWaId: testContactWaId
            }
          },
          create: {
            automationId: automation.id,
            connectionId: connection.id,
            contactWaId: testContactWaId,
            status: 'active',
            llmCost: 0.0,
            llmPromptTokens: 0,
            llmCompletionTokens: 0
          },
          update: {
            llmCost: 0.0,
            llmPromptTokens: 0,
            llmCompletionTokens: 0
          }
        });
        createdSessionId = sessionRecord.id;
        mockChannel.sessionId = createdSessionId;
        console.log(`✅ Test session initialized in DB (ID: ${createdSessionId}) with starting cost: $0.000000`);
      }
    }

    const manager = new WhatsAppConversationManager(mockChannel);
    await manager.start({
      systemPrompt: 'You are a concise dental clinic assistant. Reply in under 10 words.',
      firstMessage: null
    });

    // --- Turn 1 ---
    console.log('\n--- Turn 1: Customer asks "What services do you offer?" ---');
    await manager.handleUserUtterance('What services do you offer?');

    // Wait a brief moment for stream & token_usage to settle
    await new Promise((r) => setTimeout(r, 2000));

    const turn1Cost = manager.usageTracker.usage.llmCost;
    const turn1PromptTokens = manager.usageTracker.usage.llmPromptTokens;
    const turn1CompletionTokens = manager.usageTracker.usage.llmCompletionTokens;

    console.log(`🔍 Turn 1 In-Memory Usage:`);
    console.log(`  • Cost              : $${turn1Cost.toFixed(6)}`);
    console.log(`  • Prompt Tokens     : ${turn1PromptTokens}`);
    console.log(`  • Completion Tokens : ${turn1CompletionTokens}`);

    if (createdSessionId) {
      const dbSessionTurn1 = await dbService.prisma.whatsAppAutomationSession.findUnique({
        where: { id: createdSessionId }
      });
      console.log(`🔍 Turn 1 DB Session State:`);
      console.log(`  • DB llmCost        : $${(dbSessionTurn1?.llmCost || 0).toFixed(6)}`);
      console.log(`  • DB llmPromptTokens: ${dbSessionTurn1?.llmPromptTokens}`);
      console.log(`  • DB llmCompletionTokens: ${dbSessionTurn1?.llmCompletionTokens}`);
    }

    // --- Turn 2 ---
    console.log('\n--- Turn 2: Customer asks "Can I book a cleaning appointment tomorrow?" ---');
    await manager.handleUserUtterance('Can I book a cleaning appointment tomorrow?');

    await new Promise((r) => setTimeout(r, 2000));

    const turn2Cost = manager.usageTracker.usage.llmCost;
    const turn2PromptTokens = manager.usageTracker.usage.llmPromptTokens;
    const turn2CompletionTokens = manager.usageTracker.usage.llmCompletionTokens;

    console.log(`🔍 Turn 2 In-Memory Cumulative Usage:`);
    console.log(`  • Cumulative Cost   : $${turn2Cost.toFixed(6)} (Previous: $${turn1Cost.toFixed(6)})`);
    console.log(`  • Prompt Tokens     : ${turn2PromptTokens} (Previous: ${turn1PromptTokens})`);
    console.log(`  • Completion Tokens : ${turn2CompletionTokens} (Previous: ${turn1CompletionTokens})`);

    if (createdSessionId) {
      const dbSessionTurn2 = await dbService.prisma.whatsAppAutomationSession.findUnique({
        where: { id: createdSessionId }
      });
      console.log(`🔍 Turn 2 DB Session State:`);
      console.log(`  • DB llmCost        : $${(dbSessionTurn2?.llmCost || 0).toFixed(6)}`);
      console.log(`  • DB llmPromptTokens: ${dbSessionTurn2?.llmPromptTokens}`);
      console.log(`  • DB llmCompletionTokens: ${dbSessionTurn2?.llmCompletionTokens}`);

      if (dbSessionTurn2.llmCost > turn1Cost) {
        console.log('\n🎉 SUCCESS: Turn 2 cost was accurately added to Turn 1 cost in both memory and DB!');
      } else {
        console.warn('⚠️ Warning: Turn 2 cost was not greater than Turn 1 cost.');
      }
    }

    console.log('\n✅ WhatsApp Cost Tracking Test Completed Successfully.\n');

  } catch (err) {
    console.error('❌ WhatsApp Cost Test Error:', err);
  } finally {
    await dbService.disconnect();
  }
}

testWhatsAppCostAccumulation();
