const { createLLM } = require('../integrations/ProviderFactory');
const { WhatsAppToolRegistry, WhatsAppToolExecutor } = require('./tools');
const { sanitizeToolPairs } = require('./tools/sanitizeToolPairs');
const { UsageTracker } = require('../services/UsageTracker');
const { normalizeWhatsAppResponse, extractPlainText } = require('./responseNormalizer');
const { dbService } = require('../services/DatabaseService');
const { WhatsAppAutomationLogService } = require('./logService');
const crm = require('./tools/crmService');

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
    // Serialise concurrent LLM round-trips per session.
    // A fast second message must wait for the first tool-call chain to fully
    // settle before starting its own, otherwise the shared transcript and
    // abortController get corrupted.
    this._generating = null;
    
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
      await this.toolExecutor.handleBatch(calls, fullReply);
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
    const content = String(text || '').trim();
    if (!content) return;

    if (this.isHandoff) {
      // Check if customer wants to resume bot/automated assistance
      const resumeKeywords = new Set(['bot', 'restart', 'menu', 'ai', 'start', 'resume', 'assistant']);
      const cleanLower = content.toLowerCase();
      if (resumeKeywords.has(cleanLower) || cleanLower === 'talk to bot' || cleanLower === 'automated') {
        this.isHandoff = false;
        this.isActive = true;
        if (this.channel?.instanceId && this.channel?.contactWaId) {
          await dbService.prisma.whatsAppAutomationSession.updateMany({
            where: { connectionId: this.channel.instanceId, contactWaId: this.channel.contactWaId },
            data: { status: 'active' },
          }).catch(() => {});
        }
        const resumeMsg = normalizeWhatsAppResponse({
          _type: 'text',
          text: '🤖 *Automated Assistant Resumed*\n\nHow can I help you today? Feel free to ask about our services, bookings, complaints, or any other query.',
        });
        this.transcript.push({ role: 'assistant', content: extractPlainText(resumeMsg), richResponse: resumeMsg });
        await this.channel.sendResponse(resumeMsg);
        return;
      }

      // Record customer message in transcript while in handoff mode
      this.transcript.push({ role: 'user', content });

      // Log activity to CRM so human agent sees it on the timeline
      const autoId = this.automationId || this.channel?.automationId;
      const waId = this.contactWaId || this.channel?.contactWaId;
      if (autoId && waId) {
        crm.ensureContact({ automationId: autoId, waId }).then((c) => {
          if (c) crm.logActivity(autoId, c.id, null, 'handoff_message', content, null, 'customer');
        }).catch(() => {});
      }

      // Reassure customer with an acknowledgment (throttled to avoid spamming on rapid messages)
      const now = Date.now();
      const lastHandoffAck = this._lastHandoffAckTime || 0;
      if (now - lastHandoffAck > 30000) {
        this._lastHandoffAckTime = now;
        const ackMsg = normalizeWhatsAppResponse({
          _type: 'text',
          text: '📌 *Message Received*\n\nOur team has received your message and will connect with you in a short time. Please keep patience as our representatives reach out as soon as they are available. 🙏\n\n_(Reply *BOT* or *MENU* at any time if you wish to return to the automated assistant.)_',
        });
        this.transcript.push({ role: 'assistant', content: extractPlainText(ackMsg), richResponse: ackMsg });
        await this.channel.sendResponse(ackMsg);
      }
      return;
    }

    if (!this.isActive) return;

    // Serialise concurrent LLM round-trips: wait for any ongoing generation
    // (including all tool re-prompts) to fully settle before starting a new one.
    // Without this, a rapid second message can overlap an in-flight tool loop,
    // corrupting the shared transcript and triggering the abort on the LLM stream.
    if (this._generating) {
      try { await this._generating; } catch (_) { /* previous turn's error, ignore */ }
    }

    let resolveGeneration;
    this._generating = new Promise((resolve) => { resolveGeneration = resolve; });

    try {
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

      // Fetch open records for real-time customer context injection
      let contextInjection = null;
      try {
        const autoId = this.automationId || this.channel?.automationId;
        const waId = this.contactWaId || this.channel?.contactWaId;
        if (autoId && waId) {
          const openRecords = await crm.getOpenRecordsForWaId(autoId, waId);
          if (openRecords && openRecords.length > 0) {
            contextInjection = {
              role: 'system',
              content: crm.formatOpenRecordsPrompt(openRecords, this.timezone || 'Asia/Kolkata'),
            };
          }
        }
      } catch (openErr) {
        // Non-fatal
      }

      this.toolExecutor.contextInjection = contextInjection;

      await this.llm.generateResponse(
        this.getRecentTranscript(),
        this.registry.getAllSchemas(),
        'auto',
        contextInjection,
        false,   // allowAbort — session is already serialised by _generating guard
      );
    } finally {
      this._generating = null;
      resolveGeneration();
    }
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
