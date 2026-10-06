/**
 * BaileysInstanceManager
 *
 * Manages multiple Baileys WhatsApp instances.
 * Handles instance lifecycle, QR code generation, and connection status.
 * Integrates with existing ConversationManager for message handling.
 */

const { BaileysProvider } = require('../integrations/whatsapp/baileysProvider');
const { WhatsAppConversationManager } = require('../whatsappAutomation/conversationManager');
const { buildWhatsAppPrompt } = require('../whatsappAutomation/promptBuilder');
const { store } = require('../whatsappAutomation/sessionStore');
const { loadAgentRuntime } = require('../modules/agent/agentRuntime');
const { dbService } = require('./DatabaseService');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

/**
 * Minimal channel adapter for Baileys WhatsApp text — no audio, no STT, no TTS.
 * ConversationManager calls sendControlMessage(); we intercept message_complete
 * events and forward the text back as a WhatsApp message.
 */
class BaileysChannelAdapter extends EventEmitter {
  constructor({ provider, contactWaId, jid }) {
    super();
    this.provider = provider;
    this.contactWaId = contactWaId;
    this.jid = jid || `${contactWaId}@s.whatsapp.net`;
    this.ended = false;
    // Suppress the initial greeting — for WhatsApp, the user messages first
    // We'll send a greeting only if the agent has an initialMessage configured
    this._suppressNextGreeting = false;
  }

  // ConversationManager emits all events through sendControlMessage.
  // The LLM's final agent reply comes as: { event: 'transcript', data: { text, speaker: 'agent', isFinal: true } }
  sendControlMessage(msg) {
    // Forward all events to any live-socket listener
    if (typeof this._onControlMessage === 'function') {
      try { this._onControlMessage(msg); } catch (e) { /* ignore */ }
    }
  }

  // No-ops — text-only channel
  sendAudio() {}
  clearAudio() {}
  endSession() {
    if (this.ended) return;
    this.ended = true;
    this.emit('disconnected');
  }
  getSessionMetadata() { return { provider: 'whatsapp_baileys' }; }

  setControlMessageHandler(fn) {
    this._onControlMessage = fn;
  }

  async sendText(text) {
    if (text) await this.provider.sendText(this.jid, text);
  }
}


class BaileysInstanceManager extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map(); // instanceId -> BaileysProvider
    this.authPath = process.env.BAILEYS_AUTH_FOLDER || './baileys_auth';
    this.agentMapping = new Map(); // instanceId -> agentId
    this.standaloneInstances = new Set();
    this.standaloneHandlers = new Map();
    this.persistenceFile = path.join(this.authPath, 'instances.json');
    this.loadPersistedInstances();
  }

  /**
   * Load persisted instances from disk
   */
  loadPersistedInstances() {
    try {
      if (fs.existsSync(this.persistenceFile)) {
        const data = JSON.parse(fs.readFileSync(this.persistenceFile, 'utf8'));
        console.log(`[BaileysInstanceManager] Loading ${data.length} persisted instances from ${this.persistenceFile}`);

        for (const item of data) {
          this.agentMapping.set(item.instanceId, item.agentId);

          // Check if saved auth credentials exist — if so, auto-start the provider
          const authFolder = path.join(this.authPath, item.instanceId);
          const credsFile = path.join(authFolder, 'creds.json');
          const hasSavedAuth = fs.existsSync(credsFile);

          if (hasSavedAuth) {
            console.log(`[BaileysInstanceManager] Found saved auth for ${item.instanceId}, auto-starting provider...`);
            try {
              const provider = new BaileysProvider({
                instanceId: item.instanceId,
                authPath: this.authPath,
                onQR: (qr) => this.handleQR(item.instanceId, qr),
                onConnectionUpdate: (update) => this.handleConnectionUpdate(item.instanceId, update),
                onMessage: (message) => this.handleMessage(item.instanceId, message)
              });
              this.instances.set(item.instanceId, provider);
              console.log(`[BaileysInstanceManager] Auto-started provider for ${item.instanceId}`);
            } catch (err) {
              console.error(`[BaileysInstanceManager] Failed to auto-start provider for ${item.instanceId}:`, err);
            }
          } else {
            console.log(`[BaileysInstanceManager] No saved auth for ${item.instanceId}, will need manual reconnect`);
          }
        }
      } else {
        console.log('[BaileysInstanceManager] No persistence file found, starting fresh');
      }
    } catch (err) {
      console.error('[BaileysInstanceManager] Error loading persisted instances:', err);
    }
  }


  /**
   * Persist instance metadata to disk
   */
  persistInstances() {
    try {
      const data = [];
      for (const [instanceId, agentId] of this.agentMapping.entries()) {
        data.push({ instanceId, agentId, timestamp: Date.now() });
      }
      
      // Ensure auth directory exists
      if (!fs.existsSync(this.authPath)) {
        console.log('[BaileysInstanceManager] Creating auth directory:', this.authPath);
        fs.mkdirSync(this.authPath, { recursive: true });
      }
      
      fs.writeFileSync(this.persistenceFile, JSON.stringify(data, null, 2));
      console.log('[BaileysInstanceManager] Persisted instance metadata to:', this.persistenceFile);
    } catch (err) {
      console.error('[BaileysInstanceManager] Error persisting instances:', err);
    }
  }

  /**
   * Create a new Baileys instance
   * @param {string} instanceId - Unique identifier for this instance
   * @param {string} agentId - Optional agent ID to associate with this instance
   * @returns {BaileysProvider}
   */
  createInstance(instanceId, agentId = null) {
    if (this.instances.has(instanceId)) {
      throw new Error(`Instance ${instanceId} already exists`);
    }

    const provider = new BaileysProvider({
      instanceId,
      authPath: this.authPath,
      onQR: (qr) => this.handleQR(instanceId, qr),
      onConnectionUpdate: (update) => this.handleConnectionUpdate(instanceId, update),
      onMessage: (message) => this.handleMessage(instanceId, message)
    });

    this.instances.set(instanceId, provider);
    // Always set the mapping, even if agentId is null
    this.agentMapping.set(instanceId, agentId);
    this.persistInstances();
    console.log(`[BaileysInstanceManager] Created instance ${instanceId}${agentId ? ` for agent ${agentId}` : ''}`);
    
    return provider;
  }

  /**
   * Get an existing instance
   * @param {string} instanceId
   * @returns {BaileysProvider | undefined}
   */
  getInstance(instanceId) {
    return this.instances.get(instanceId);
  }

  /**
   * Get all instances
   * @returns {Array<{instanceId: string, status: object, agentId?: string}>}
   */
  getAllInstances() {
    const result = [];
    
    // First, add active instances (provider is running)
    for (const [instanceId, provider] of this.instances.entries()) {
      const status = provider.getStatus();
      result.push({
        instanceId,
        agentId: this.agentMapping.get(instanceId) || null,
        isActive: true,
        ...status
      });
    }
    
    // Then, add metadata-only instances (persisted but not currently active)
    for (const [instanceId, agentId] of this.agentMapping.entries()) {
      if (!this.instances.has(instanceId)) {
        result.push({
          instanceId,
          agentId: agentId || null,
          isActive: false,
          status: 'disconnected'
        });
      }
    }
    
    console.log(`[BaileysInstanceManager] Returning ${result.length} instances`);
    return result;
  }

  /**
   * Remove and disconnect an instance
   * @param {string} instanceId
   */
  async removeInstance(instanceId) {
    const provider = this.instances.get(instanceId);
    if (provider) {
      await provider.disconnect();
      this.instances.delete(instanceId);
      this.agentMapping.delete(instanceId);
      this.persistInstances();
      console.log(`[BaileysInstanceManager] Removed instance ${instanceId}`);
      this.emit('instanceRemoved', { instanceId });
    } else {
      // Remove only the mapping if no active provider exists
      this.agentMapping.delete(instanceId);
      this.persistInstances();
      console.log(`[BaileysInstanceManager] Removed mapping for instance ${instanceId}`);
      this.emit('instanceRemoved', { instanceId });
    }
  }

  /**
   * Handle QR code generation
   */
  handleQR(instanceId, qr) {
    console.log(`[BaileysInstanceManager] QR code generated for ${instanceId}`);
    this.emit('qr', { instanceId, qr });
  }

  /**
   * Handle connection status updates
   */
  handleConnectionUpdate(instanceId, update) {
    console.log(`[BaileysInstanceManager] Connection update for ${instanceId}:`, update);
    this.emit('connectionUpdate', { instanceId, ...update });
  }

  registerStandaloneInstance(instanceId, handler) {
    this.standaloneInstances.add(instanceId);
    if (handler) this.standaloneHandlers.set(instanceId, handler);
  }

  unregisterStandaloneInstance(instanceId) {
    this.standaloneInstances.delete(instanceId);
    this.standaloneHandlers.delete(instanceId);
  }

  /**
   * Handle incoming messages - route through ConversationManager
   */
  async handleMessage(instanceId, message) {
    console.log(`[BaileysInstanceManager] Message received for ${instanceId} from ${message.from}`);
    const standaloneHandler = this.standaloneHandlers.get(instanceId);
    if (standaloneHandler) {
      await standaloneHandler(message);
      return;
    }
    this.emit('message', { instanceId, message });

    // 1. Check if there is an active WhatsAppAutomation connection in the database
    try {
      const connection = await dbService.prisma.whatsAppConnection.findFirst({
        where: {
          OR: [
            { instanceId },
            { id: instanceId },
          ],
          enabled: true,
        },
        include: { automation: { include: { tools: true } } },
      });

      if (connection && connection.automation && connection.automation.status !== 'paused') {
        const provider = this.instances.get(instanceId);
        if (provider) {
          const { handleMessages } = require('../whatsappAutomation/runtime');
          await handleMessages({
            automation: connection.automation,
            connection,
            provider,
            messages: [message],
          });
          return;
        }
      }
    } catch (err) {
      console.error('[BaileysInstanceManager] Error checking WhatsAppConnection:', err);
    }

    if (this.standaloneInstances.has(instanceId)) return;

    // Get the provider
    const provider = this.instances.get(instanceId);
    if (!provider) {
      console.error(`[BaileysInstanceManager] Provider not found for instance ${instanceId}`);
      return;
    }

    // Get associated agent — try explicit mapping first
    let agentId = this.agentMapping.get(instanceId) || null;
    if (!agentId) {
      try {
        const phone = await dbService.prisma.phoneNumber.findFirst({
          where: {
            OR: [
              { whatsAppInstanceId: instanceId },
              { phoneNumber: message.from },
            ],
            agentId: { not: null },
          },
        });
        if (phone?.agentId) agentId = phone.agentId;
      } catch (e) {}
    }

    // Route through ConversationManager (text-only, no STT/TTS)
    try {
      await this._routeMessageToChatbot({
        instanceId,
        provider,
        contactWaId: message.from,
        message,
        agentId,
      });
    } catch (err) {
      console.error('[BaileysInstanceManager] Error routing message:', err);
    }
  }

  /**
   * Route a WhatsApp text message through ConversationManager (LLM-only, no STT/TTS)
   */
  async _routeMessageToChatbot({ instanceId, provider, contactWaId, message, agentId }) {
    let entry = store.get(instanceId, contactWaId);
    let conversationManager = entry?.conversationManager;
    const isNewSession = !entry;
    let firstMessage = '';

    if (!conversationManager) {
      const adapter = new BaileysChannelAdapter({ provider, contactWaId, jid: message.jid });
      
      let config = {
        language: 'en-US',
        channel: 'whatsapp',
        contactWaId,
      };

      if (!agentId) {
        try {
          const fallbackAgent = await dbService.prisma.agent.findFirst({
            where: { whatsappEnabled: true },
            orderBy: { updatedAt: 'desc' },
          }) || await dbService.prisma.agent.findFirst({
            orderBy: { updatedAt: 'desc' },
          });
          if (fallbackAgent) agentId = fallbackAgent.id;
        } catch (e) {}
      }

      if (agentId) {
        try {
          const { agent, registry, systemPrompt } = await loadAgentRuntime(agentId);
          conversationManager = new WhatsAppConversationManager(adapter, agent.providers || null);
          conversationManager.registry = registry;
          conversationManager.toolExecutor.registry = registry;
          config = {
            ...config,
            ...agent,
            systemPrompt: buildWhatsAppPrompt({
              ...agent,
              systemPrompt: agent.systemPrompt || systemPrompt,
            }, {
              language: agent.language || 'en-US',
              timezone: agent.timezone,
              conversationGuidelines: agent.conversationGuidelines,
              toolNames: registry.getAllSchemas()
                .map(tool => tool.function?.name)
                .filter(Boolean),
            }),
            firstMessage: agent.initialMessage,
            language: agent.language || 'hi-IN',
            assistantName: agent.name,
            timezone: agent.timezone,
            businessName: agent.name,
            dataToCollect: agent.dataCollection || agent.tools?.dataToCollect || [],
            agentId: agent.id,
            workspaceId: agent.workspaceId,
          };
          firstMessage = typeof agent.initialMessage === 'string' ? agent.initialMessage.trim() : '';
        } catch (err) {
          console.error(`[BaileysInstanceManager] Failed to load agent ${agentId}:`, err);
          conversationManager = new WhatsAppConversationManager(adapter);
          config.systemPrompt = buildWhatsAppPrompt({});
        }
      } else {
        conversationManager = new WhatsAppConversationManager(adapter);
        config.systemPrompt = buildWhatsAppPrompt({});
      }

      conversationManager.toolExecutor.contactWaId = contactWaId;
      conversationManager.toolExecutor.contactProvider = 'baileys';

      await conversationManager.start(config);

      store.set({ id: instanceId }, { id: agentId || instanceId }, contactWaId, { conversationManager, adapter, agentId, contactWaId });
      console.log(`[BaileysInstanceManager] Started WhatsAppConversationManager for ${instanceId}:${contactWaId}`);
    } else {
      store.touch(instanceId, contactWaId);
      conversationManager = entry.conversationManager;
    }

    // The configured welcome message is the response to the first inbound
    // message. Record that message without generating a second reply.
    if (isNewSession && firstMessage && message.type === 'text') {
      conversationManager.transcript.push({ role: 'user', content: (message.text || '').trim() });
      return;
    }

    // Route by message type
    if (message.type === 'text') {
      const text = (message.text || '').trim();
      if (text) {
        await conversationManager.handleUserUtterance(text);
      }
    } else if (['image', 'audio', 'document'].includes(message.type)) {
      const caption = message.media?.caption || '';
      const userText = caption
        ? `[User sent a ${message.type} with caption: "${caption}"]`
        : `[User sent a ${message.type}]`;
      await conversationManager.handleUserUtterance(userText);
    } else if (message.type === 'location') {
      const userText = `[User shared a WhatsApp location. Latitude: ${message.location.lat}, Longitude: ${message.location.lng}]`;
      await conversationManager.handleUserUtterance(userText);
    } else {
      await conversationManager.handleUserUtterance('[unsupported message type]');
    }
  }

  /**
   * Send a message through a specific instance
   * @param {string} instanceId
   * @param {string} to - Recipient phone number
   * @param {string} type - 'text', 'image', 'document'
   * @param {object} options - Additional options (url, caption, filename)
   */
  async sendMessage(instanceId, to, type, options = {}) {
    const provider = this.instances.get(instanceId);
    if (!provider) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    switch (type) {
      case 'text':
        return await provider.sendText(to, options.body);
      case 'image':
        return await provider.sendImage(to, options.url, options.caption);
      case 'document':
        return await provider.sendDocument(to, options.url, options.filename);
      default:
        throw new Error(`Unsupported message type: ${type}`);
    }
  }

  /**
   * Get instance status
   * @param {string} instanceId
   */
  getInstanceStatus(instanceId) {
    const provider = this.instances.get(instanceId);
    if (!provider) {
      return null;
    }
    return {
      ...provider.getStatus(),
      agentId: this.agentMapping.get(instanceId) || null
    };
  }

  /**
   * Associate an instance with an agent
   * @param {string} instanceId
   * @param {string} agentId
   */
  setAgentMapping(instanceId, agentId) {
    this.agentMapping.set(instanceId, agentId);
    this.persistInstances();
    console.log(`[BaileysInstanceManager] Mapped instance ${instanceId} to agent ${agentId}`);
  }

  /**
   * Reconnect a persisted instance
   * @param {string} instanceId
   * @returns {BaileysProvider}
   */
  reconnectInstance(instanceId) {
    // If already active, just return the existing provider (idempotent)
    if (this.instances.has(instanceId)) {
      console.log(`[BaileysInstanceManager] Instance ${instanceId} is already active, returning existing provider`);
      return this.instances.get(instanceId);
    }

    if (!this.agentMapping.has(instanceId)) {
      throw new Error(`Instance ${instanceId} not found in metadata`);
    }

    const agentId = this.agentMapping.get(instanceId);
    const provider = new BaileysProvider({
      instanceId,
      authPath: this.authPath,
      onQR: (qr) => this.handleQR(instanceId, qr),
      onConnectionUpdate: (update) => this.handleConnectionUpdate(instanceId, update),
      onMessage: (message) => this.handleMessage(instanceId, message)
    });

    this.instances.set(instanceId, provider);
    console.log(`[BaileysInstanceManager] Reconnected instance ${instanceId}${agentId ? ` for agent ${agentId}` : ''}`);
    
    return provider;
  }

  /**
   * Clean up all instances (for shutdown)
   */
  async cleanup() {
    console.log('[BaileysInstanceManager] Cleaning up all instances...');
    const disconnectPromises = [];
    for (const [instanceId, provider] of this.instances.entries()) {
      disconnectPromises.push(provider.disconnect());
    }
    await Promise.all(disconnectPromises);
    this.instances.clear();
    this.agentMapping.clear();
  }
}

// Singleton instance
const baileysInstanceManager = new BaileysInstanceManager();

module.exports = { BaileysInstanceManager, baileysInstanceManager };
