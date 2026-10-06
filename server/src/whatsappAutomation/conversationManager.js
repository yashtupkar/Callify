const { createLLM } = require('../integrations/ProviderFactory');
const { ToolExecutor } = require('../tools/ToolExecutor');
const { ToolRegistry } = require('../tools/ToolRegistry');
const { UsageTracker } = require('../services/UsageTracker');

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
    this.llm.on('llm_reply_complete', (reply) => {
      this.transcript.push({ role: 'assistant', content: reply });
      this.sendToClient({ event: 'transcript', data: { text: reply, isFinal: true, speaker: 'agent' } });
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
    this.llm.on('llm_error', error => {
      console.error('[WhatsAppConversationManager] LLM error:', error);
    });
  }

  async start({ systemPrompt, firstMessage }) {
    this.llm.initialize(systemPrompt);
    this.isActive = true;
    if (firstMessage) {
      this.transcript.push({ role: 'assistant', content: firstMessage });
      await this.channel.sendText(firstMessage);
    }
  }

  async handleUserUtterance(text) {
    const content = String(text || '').trim();
    if (!this.isActive || !content) return;
    this.transcript.push({ role: 'user', content });
    await this.llm.generateResponse(
      this.getRecentTranscript(),
      this.registry.getAllSchemas(),
      'auto',
    );
  }

  getRecentTranscript() {
    if (this.transcript.length <= this.maxContextMessages) return this.transcript;
    return this.transcript.slice(-this.maxContextMessages);
  }

  getAllTools() {
    return this.registry.getAllSchemas();
  }

  sendToClient(message) {
    if (message?.event === 'transcript' && message.data?.speaker === 'agent' && message.data.text) {
      this.channel.sendText(message.data.text).catch(error => {
        console.error('[WhatsAppConversationManager] text send error:', error);
      });
    }
  }

  endConversation() {
    this.isActive = false;
  }
}

module.exports = { WhatsAppConversationManager };
