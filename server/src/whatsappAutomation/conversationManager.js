const { createLLM } = require('../integrations/ProviderFactory');
const { ToolExecutor } = require('../tools/ToolExecutor');
const { ToolRegistry } = require('../tools/ToolRegistry');
const { UsageTracker } = require('../services/UsageTracker');
const { normalizeWhatsAppResponse, extractPlainText } = require('./responseNormalizer');

/**
 * Text-only conversation runtime for standalone WhatsApp automations.
 * This intentionally does not share the voice ConversationManager lifecycle.
 */
class WhatsAppConversationManager {
  constructor(channel, providerConfig = null) {
    this.channel = channel;
    this.llm = createLLM(providerConfig?.llm);
    this.registry = new ToolRegistry();
    this.transcript = [];
    this.isActive = false;
    this.isHandoff = false;
    this.maxContextMessages = 40;
    this.usageTracker = new UsageTracker();
    this.toolExecutor = new ToolExecutor({
      registry: this.registry,
      tts: null,
      llm: this.llm,
      transcript: this.transcript,
      sendToClient: this.sendToClient.bind(this),
      endConversation: this.endConversation.bind(this),
      usageTracker: this.usageTracker,
      getRecentTranscript: () => this.getRecentTranscript(),
    });

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
          text: reply,
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
          continue;
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
      await this.channel.sendText(firstMessage);
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

    await this.llm.generateResponse(
      this.getRecentTranscript(),
      this.registry.getAllSchemas(),
      'auto',
    );
  }

  getRecentTranscript() {
    // Return formatted transcript without internal circular objects
    const list = this.transcript.map((item) => ({
      role: item.role,
      content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content),
    }));
    if (list.length <= this.maxContextMessages) return list;
    return list.slice(-this.maxContextMessages);
  }

  getAllTools() {
    return this.registry.getAllSchemas();
  }

  sendToClient(message) {
    if (message?.event === 'transcript' && message.data?.speaker === 'agent') {
      const payload = message.data.text;
      if (payload) {
        this.channel.sendText(payload).catch((error) => {
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
