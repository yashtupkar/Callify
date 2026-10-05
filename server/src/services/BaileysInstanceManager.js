/**
 * BaileysInstanceManager
 *
 * Manages multiple Baileys WhatsApp instances.
 * Handles instance lifecycle, QR code generation, and connection status.
 * Integrates with existing ConversationManager for message handling.
 */

const { BaileysProvider } = require('../integrations/whatsapp/baileysProvider');
const { ConversationManager } = require('./ConversationManager');
const { store } = require('./WhatsAppSessionStore');
const { loadAgentRuntime } = require('../modules/agent/agentRuntime');
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
    if (msg?.event === 'transcript' && msg?.data?.speaker === 'agent' && msg?.data?.isFinal === true) {
      const text = (msg.data.text || '').trim();
      if (!text) return;

      console.log(`[BaileysChannelAdapter] Sending reply to ${this.jid}: "${text.slice(0, 80)}"`);
      this.provider.sendText(this.jid, text).catch(err => {
        console.error('[BaileysChannelAdapter] Failed to send WhatsApp reply:', err.message);
      });
    }

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
}


class BaileysInstanceManager extends EventEmitter {
  constructor() {
    super();
    this.instances = new Map(); // instanceId -> BaileysProvider
    this.authPath = process.env.BAILEYS_AUTH_FOLDER || './baileys_auth';
    this.agentMapping = new Map(); // instanceId -> agentId
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

  /**
   * Handle incoming messages - route through ConversationManager
   */
  async handleMessage(instanceId, message) {
    console.log(`[BaileysInstanceManager] Message received for ${instanceId} from ${message.from}`);
    this.emit('message', { instanceId, message });

    // Get the provider
    const provider = this.instances.get(instanceId);
    if (!provider) {
      console.error(`[BaileysInstanceManager] Provider not found for instance ${instanceId}`);
      return;
    }

    // Get associated agent — try explicit mapping first
    let agentId = this.agentMapping.get(instanceId) || null;

    // Route through ConversationManager (text-only, no STT/TTS)
    try {
      await this._routeMessageToChatbot({
        instanceId,
        provider,
        contactWaId: message.from,
        message,
        agentId
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

    if (!conversationManager) {
      const adapter = new BaileysChannelAdapter({ provider, contactWaId, jid: message.jid });
      
      let config = {
        language: 'en-US',
        channel: 'whatsapp',
        contactWaId,
        skipGreeting: true,
      };

      if (agentId) {
        try {
          const { agent, registry, systemPrompt } = await loadAgentRuntime(agentId);
          conversationManager = new ConversationManager(adapter, agent.providers || null);
          // loadAgentRuntime builds the agent's complete tool registry. Reuse it
          // so WhatsApp turns have the same tools as browser conversations.
          conversationManager.registry = registry;
          conversationManager.toolExecutor.registry = registry;
          config = {
            ...config,
            ...agent,
            systemPrompt,
            firstMessage: agent.initialMessage,
            language: agent.language || 'hi-IN',
            assistantName: agent.name,
            timezone: agent.timezone,
            businessName: agent.name,
            dataToCollect: agent.dataCollection || agent.tools?.dataToCollect || [],
            agentId: agent.id,
            workspaceId: agent.workspaceId,
          };
        } catch (err) {
          console.error(`[BaileysInstanceManager] Failed to load agent ${agentId}:`, err);
          conversationManager = new ConversationManager(adapter, null);
        }
      } else {
        conversationManager = new ConversationManager(adapter, null);
      }

      conversationManager.toolExecutor.contactWaId = contactWaId;
      conversationManager.toolExecutor.contactProvider = 'baileys';

      await conversationManager.startConversation(config, 'whatsapp');

      store.set(instanceId, contactWaId, { conversationManager, adapter, agentId, contactWaId });
      console.log(`[BaileysInstanceManager] Started ConversationManager for ${instanceId}:${contactWaId}`);
    } else {
      store.touch(instanceId, contactWaId);
      conversationManager = entry.conversationManager;
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
