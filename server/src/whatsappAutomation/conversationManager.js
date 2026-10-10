const { createLLM } = require('../integrations/ProviderFactory');
const { WhatsAppToolRegistry, WhatsAppToolExecutor } = require('./tools');
const { sanitizeToolPairs } = require('./tools/sanitizeToolPairs');
const { UsageTracker } = require('../services/UsageTracker');
const { normalizeWhatsAppResponse, extractPlainText } = require('./responseNormalizer');
const { dbService } = require('../services/DatabaseService');
const { WhatsAppAutomationLogService } = require('./logService');

/**
 * Text-only conversation runtime for standalone WhatsApp automations.
 * This intentionally does not share the voice ConversationManager lifecycle.
 */
class WhatsAppConversationManager {
  constructor(channel, providerConfig = null) {
    this.channel = channel;
    this.llm = createLLM(providerConfig?.llm);
    // Enable JSON mode for structured WhatsApp responses
    this.llm.setJsonMode(true);
    this.registry = new WhatsAppToolRegistry();
    this.transcript = [];
    this.isActive = false;
    this.isHandoff = false;
    this.maxContextMessages = 40;
    this.usageTracker = new UsageTracker();
    
    // Create logger for this automation
    this.automationId = channel?.automationId;
    this.sessionId = channel?.sessionId;
    this.contactWaId = channel?.contactWaId;
    this.logger = this.automationId ? WhatsAppAutomationLogService.build(this.automationId, {
      sessionId: this.sessionId,
      contactWaId: this.contactWaId,
    }) : null;

    this.toolExecutor = new WhatsAppToolExecutor({
      registry: this.registry,
      llm: this.llm,
      transcript: this.transcript,
      getRecentTranscript: () => this.getRecentTranscript(),
      onToolEvent: () => {
        this.usageTracker.incrementToolCall();
        if (this.channel?.instanceId && this.channel?.contactWaId) {
          dbService.prisma.whatsAppAutomationSession.updateMany({
            where: { connectionId: this.channel.instanceId, contactWaId: this.channel.contactWaId },
            data: { toolCalls: { increment: 1 } },
          }).catch(() => {});
        }
      },
      logger: this.logger,
      automationId: this.automationId,
      sessionId: this.sessionId,
      contactWaId: this.contactWaId,
    });
    this.toolExecutor.context.onHandoff = () => this.handoffToHuman();

    this.llm.on('llm_reply_complete', async (reply) => {
      const normalized = normalizeWhatsAppResponse(reply);
      const displayContent = extractPlainText(normalized);

      // Record in transcript with structured rich metadata
      this.transcript.push({
        role: 'assistant',
        content: displayContent,
        richResponse: normalized,
      });

      if (normalized._type === 'handoff') {
        this.isHandoff = true;
        this.isActive = false;
      }

      this.sendToClient({
        event: 'transcript',
        data: {
          text: displayContent,
          displayContent,
          normalized,
          isFinal: true,
          speaker: 'agent',
        },
      });
    });

    this.llm.on('tool_calls', async (calls, fullReply) => {
      for (const [index, call] of calls.entries()) {
        if (!call.name) continue;
        let args = {};
        try {
          args = call.argsStr.trim() ? JSON.parse(call.argsStr) : {};
        } catch (error) {
          console.error('[WhatsAppConversationManager] Invalid tool arguments:', error.message);
        }
        await this.toolExecutor.handle(
          call.name,
          args,
          index === 0 ? fullReply : '',
          call.id,
          index === calls.length - 1,
        );
      }
    });

    this.llm.on('llm_error', (error) => {
      console.error('[WhatsAppConversationManager] LLM error:', error);
    });
  }

  async start({ systemPrompt, firstMessage }) {
    this.llm.initialize(systemPrompt);
    this.isActive = true;
    this.isHandoff = false;
    if (firstMessage) {
      const normalized = normalizeWhatsAppResponse(firstMessage);
      const displayContent = extractPlainText(normalized);
      this.transcript.push({
        role: 'assistant',
        content: displayContent,
        richResponse: normalized,
      });
      await this.channel.sendResponse(normalized);
    }
  }

  async handleUserUtterance(text, messageMeta = null) {
    if (this.isHandoff) {
      console.log('[WhatsAppConversationManager] Skipping AI response — conversation is in human handoff mode.');
      return;
    }

    const content = String(text || '').trim();
    if (!this.isActive || !content) return;

    const transcriptItem = { role: 'user', content };
    if (messageMeta && messageMeta.interactionType) {
      transcriptItem.interaction = {
        type: messageMeta.interactionType,
        id: messageMeta.id,
        title: messageMeta.title,
      };
    }

    this.transcript.push(transcriptItem);
    this.toolExecutor.resetTurn();

    // Increment LLM call counter
    if (this.channel?.instanceId && this.channel?.contactWaId) {
      dbService.prisma.whatsAppAutomationSession.updateMany({
        where: { connectionId: this.channel.instanceId, contactWaId: this.channel.contactWaId },
        data: { llmCalls: { increment: 1 } },
      }).catch(() => {}); // Fire and forget
    }

    await this.llm.generateResponse(
      this.getRecentTranscript(),
      this.registry.getAllSchemas(),
      'auto',
    );
  }

  getRecentTranscript() {
    // Return formatted transcript without internal circular objects
    const list = this.transcript.map((item) => {
      const message = {
        role: item.role,
        content: item.content === null || item.content === undefined || typeof item.content === 'string'
          ? item.content ?? null
          : JSON.stringify(item.content),
      };
      // Tool-call pairs must reach the model intact or providers reject the request.
      if (item.tool_calls) message.tool_calls = item.tool_calls;
      if (item.role === 'tool') { message.tool_call_id = item.tool_call_id; message.name = item.name; }
      return message;
    });
    const recent = list.length <= this.maxContextMessages ? list : list.slice(-this.maxContextMessages);
    return sanitizeToolPairs(recent);
  }

  setRegistry(registry) {
    this.registry = registry;
    this.toolExecutor.registry = registry;
  }

  async handoffToHuman() {
    this.isHandoff = true;
    this.isActive = false;
    if (this.channel?.instanceId && this.channel?.contactWaId) {
      await dbService.prisma.whatsAppAutomationSession.updateMany({
        where: { connectionId: this.channel.instanceId, contactWaId: this.channel.contactWaId },
        data: { status: 'human_handoff' },
      }).catch(() => {});
    }
  }

  getAllTools() {
    return this.registry.getAllSchemas();
  }

  sendToClient(message) {
    if (message?.event === 'transcript' && message.data?.speaker === 'agent') {
      const payload = message.data.normalized || message.data.text;
      if (payload) {
        this.channel.sendResponse(payload).catch((error) => {
          console.error('[WhatsAppConversationManager] text send error:', error.message);
        });
      }
    }
  }

  endConversation() {
    this.isActive = false;
  }
}

module.exports = { WhatsAppConversationManager };
