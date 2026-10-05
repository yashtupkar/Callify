/**
 * WhatsAppInboundRouter
 *
 * Single entry point for ALL inbound WhatsApp webhooks. Looks up the
 * WhatsAppInstance + Agent by webhook context, normalizes the payload,
 * then routes per-contact to a WhatsAppSessionStore entry.
 *
 * Each contact gets a ConversationManager that is reused for the 24h
 * rolling window. Text messages are forwarded as user utterances;
 * media is wrapped in a synthetic transcribe_media call that the
 * ToolExecutor (after we patch it) will resolve.
 */

const { dbService } = require('./DatabaseService');
const { ConversationManager } = require('./ConversationManager');
const { WhatsAppChannelAdapter } = require('../channels/WhatsAppChannelAdapter');
const { store } = require('./WhatsAppSessionStore');
const { loadAgentRuntime } = require('../modules/agent/agentRuntime');
const { buildToolSchema } = require('../tools/WebhookToolExecutor');
const { transcribeMedia } = require('../modules/whatsapp/transcribeMedia');

class WhatsAppInboundRouter {
  /**
   * Handle a webhook request. Returns the Express response to send.
   */
  static async handle(req, res) {
    try {
      const { provider, instance } = await this._resolveProviderFromReq(req);
      if (!provider || !instance) {
        console.warn('[WhatsAppInboundRouter] No matching WhatsApp instance for webhook.');
        return res.status(404).send('No matching instance');
      }

      if (req.method === 'GET') {
        const hs = provider.verifyHandshake(req);
        if (hs.ok && hs.challenge) return res.status(200).send(hs.challenge);
        if (hs.ok) return res.status(200).send('OK');
        return res.status(403).send(hs.error || 'Forbidden');
      }

      if (!provider.verifyInbound(req)) {
        return res.status(401).send('Invalid signature');
      }

      // Acknowledge immediately so Meta/Ultramsg doesn't retry. Actual
      // processing is async.
      res.status(200).send('OK');

      const messages = provider.parseInbound(req) || [];
      if (messages.length === 0) return;

      const phoneNumber = await this._findPhoneNumberForInstance(instance);
      if (!phoneNumber || !phoneNumber.agentId) {
        console.warn(`[WhatsAppInboundRouter] No phone number/agent bound for instance ${instance.id}`);
        return;
      }

      // Skip if automation is paused or not yet active
      const agent = await dbService.prisma.agent.findUnique({
        where: { id: phoneNumber.agentId },
        select: { id: true, whatsappEnabled: true, automationStatus: true, name: true },
      });
      if (!agent) {
        console.warn(`[WhatsAppInboundRouter] Agent ${phoneNumber.agentId} not found.`);
        return;
      }
      if (!agent.whatsappEnabled || agent.automationStatus !== 'active') {
        console.log(`[WhatsAppInboundRouter] Skipping: agent ${agent.id} is ${agent.automationStatus || 'disabled'}.`);
        return;
      }
      // Keep automationStatus in sync with whatsappEnabled
      if (agent.automationStatus !== 'active') {
        await dbService.prisma.agent.update({
          where: { id: agent.id },
          data: { automationStatus: 'active', whatsappEnabled: true },
        });
      }

      // Group by contact (most requests contain 1; we still loop for safety)
      const byContact = new Map();
      for (const m of messages) {
        if (!m.from) continue;
        if (!byContact.has(m.from)) byContact.set(m.from, []);
        byContact.get(m.from).push(m);
      }

      for (const [contactWaId, msgs] of byContact.entries()) {
        // Sort by timestamp ascending to keep transcript order sane
        msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        try {
          await this._handleContact({ instance, phoneNumber, provider, contactWaId, messages: msgs });
        } catch (err) {
          console.error('[WhatsAppInboundRouter] Error handling contact', contactWaId, err);
        }
      }
    } catch (err) {
      console.error('[WhatsAppInboundRouter] Fatal error:', err);
      if (!res.headersSent) res.status(500).send('Internal error');
    }
  }

  /**
   * Resolve the right provider + instance for a webhook request.
   * Strategy:
   *   1) URL path param `/:instanceId` (preferred) -> look up by id
   *   2) Body `instanceId` (Ultramsg) -> look up
   *   3) Meta `entry[].id` (WABA id) -> look up
   *   4) Body `phoneNumberId` (Meta phone id) -> look up
   */
  static async _resolveProviderFromReq(req) {
    const instanceIdFromPath = req.params?.instanceId;
    const body = req.body || {};
    const candidateIds = new Set();

    if (instanceIdFromPath) candidateIds.add(instanceIdFromPath);
    if (body.instanceId) candidateIds.add(body.instanceId);
    if (body.entry && Array.isArray(body.entry)) {
      for (const e of body.entry) if (e.id) candidateIds.add(e.id);
    }
    // Meta phone number id is in body.entry[].changes[].value.metadata.phone_number_id
    if (body.entry && Array.isArray(body.entry)) {
      for (const e of body.entry) {
        for (const c of (e.changes || [])) {
          const meta = c.value?.metadata;
          if (meta?.phone_number_id) candidateIds.add(meta.phone_number_id);
          if (meta?.business_id) candidateIds.add(meta.business_id);
        }
      }
    }

    for (const id of candidateIds) {
      const inst = await dbService.prisma.whatsAppInstance.findFirst({
        where: {
          OR: [
            { id },
            { instanceId: id },
            { phoneNumberId: id },
            { businessId: id },
          ],
          enabled: true,
        },
      });
      if (inst) {
        const provider = this._buildProvider(inst);
        return { provider, instance: inst };
      }
    }

    return { provider: null, instance: null };
  }

  static _buildProvider(instance) {
    const { createWhatsApp } = require('../integrations/ProviderFactory');
    return createWhatsApp({
      provider: instance.provider,
      instanceId: instance.instanceId || undefined,
      apiToken: instance.apiToken,
      phoneNumber: instance.phoneNumber,
      phoneNumberId: instance.phoneNumberId || undefined,
      businessId: instance.businessId || undefined,
      verifyToken: instance.verifyToken,
      appSecret: instance.appSecret || undefined,
    });
  }

  static async _findPhoneNumberForInstance(instance) {
    return dbService.prisma.phoneNumber.findFirst({
      where: { whatsAppInstanceId: instance.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async _handleContact({ instance, phoneNumber, provider, contactWaId, messages }) {
    const key = `${instance.id}:${contactWaId}`;
    let entry = store.get(instance.id, contactWaId);
    let conversationManager = entry?.conversationManager;
    let adapter = entry?.adapter;

    if (!conversationManager) {
      const { agent, registry, systemPrompt } = await loadAgentRuntime(phoneNumber.agentId);

      adapter = new WhatsAppChannelAdapter({
        provider,
        contactWaId,
        businessPhoneNumber: instance.phoneNumber,
        instanceId: instance.id,
      });
      if (messages[0]?.profileName) adapter.contactProfileName = messages[0].profileName;

      // Inject transcribe_media so the LLM can inspect inbound media.
      registry.injectTranscribeMediaTool(transcribeMedia({ provider, adapter, agentId: agent.id }));

      conversationManager = new ConversationManager(adapter, agent.providers || null);

      const config = {
        ...agent,
        systemPrompt,
        firstMessage: agent.initialMessage,
        voiceId: agent.voiceId,
        language: agent.language,
        assistantName: agent.name,
        timezone: agent.timezone,
        businessName: agent.name,
        dataToCollect: agent.dataCollection || agent.tools?.dataToCollect || [],
        agentId: agent.id,
        workspaceId: agent.workspaceId,
        contactWaId,
      };

      // For WhatsApp we mark contactWaId on the ToolExecutor so save_collected_data
      // can backfill the contact's phone automatically.
      conversationManager.toolExecutor.contactWaId = contactWaId;
      conversationManager.toolExecutor.contactName = adapter.contactProfileName;
      conversationManager.toolExecutor.contactProvider = instance.provider;

      await conversationManager.startConversation(config, 'whatsapp');

      store.set(instance.id, contactWaId, { conversationManager, adapter, agentId: agent.id, phoneNumberId: phoneNumber.id, contactWaId });
    } else {
      store.touch(instance.id, contactWaId);
      adapter = entry.adapter;
      conversationManager = entry.conversationManager;
    }

    // Best-effort mark-as-read for Cloud API
    if (typeof provider.markAsRead === 'function' && messages[0]?.providerMessageId) {
      provider.markAsRead(messages[0].providerMessageId).catch(() => {});
    }

    for (const m of messages) {
      if (m.type === 'text') {
        const text = (m.text || '').trim();
        if (!text) continue;
        conversationManager.handleUserUtterance(text);
      } else if (m.type === 'image' || m.type === 'audio' || m.type === 'document') {
        await this._handleMedia({ conversationManager, adapter, provider, message: m, instanceId: instance.id, contactWaId });
      } else if (m.type === 'button' || m.type === 'list') {
        conversationManager.handleUserUtterance((m.text || '').trim() || '[button reply]');
      } else {
        // unknown type — treat as empty so the LLM can ask for clarification
        conversationManager.handleUserUtterance('[unsupported message type]');
      }
    }
  }

  /**
   * For media messages, we synthesize a user utterance that tells the LLM
   * the user sent media, then force a transcribe_media tool call so the
   * model can ingest the content. The ToolExecutor's built-in handler
   * resolves the media and pushes the description back into the transcript.
   */
  static async _handleMedia({ conversationManager, adapter, provider, message, instanceId, contactWaId }) {
    const caption = message.media?.caption || '';
    const userText = caption
      ? `[User sent a ${message.type}${caption ? ` with caption: "${caption}"` : ''}]`
      : `[User sent a ${message.type}]`;

    // Push the user turn so transcript ordering stays correct
    conversationManager.transcript.push({ role: 'user', content: userText });
    conversationManager.sendToClient({ event: 'transcript', data: { text: userText, isFinal: true, speaker: 'user' } });

    // Build a synthetic tool call
    const toolCallId = 'media_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const args = {
      providerMediaId: message.media?.providerMediaId,
      mediaUrl: message.media?.url,
      mime: message.media?.mime || 'application/octet-stream',
      caption,
    };
    conversationManager.transcript.push({
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: toolCallId,
        type: 'function',
        function: { name: 'transcribe_media', arguments: JSON.stringify(args) },
      }],
    });
    conversationManager.sendToClient({ event: 'tool_call_started', toolName: 'transcribe_media', args, toolCallId, isFrontend: false, timestamp: Date.now() });

    // Execute synchronously through ToolExecutor (it's a built-in).
    try {
      const result = await conversationManager.toolExecutor.registry.execute('transcribe_media', args);
      conversationManager.transcript.push({
        role: 'tool',
        tool_call_id: toolCallId,
        name: 'transcribe_media',
        content: JSON.stringify(result),
      });
      conversationManager.sendToClient({ event: 'tool_call_completed', toolName: 'transcribe_media', toolCallId, result, timestamp: Date.now() });
    } catch (err) {
      const result = { error: err.message };
      conversationManager.transcript.push({
        role: 'tool',
        tool_call_id: toolCallId,
        name: 'transcribe_media',
        content: JSON.stringify(result),
      });
      conversationManager.sendToClient({ event: 'tool_call_completed', toolName: 'transcribe_media', toolCallId, result, timestamp: Date.now() });
    }

    // Re-prompt the LLM with the new tool result
    conversationManager.llm.generateResponse(
      conversationManager.getRecentTranscript(),
      conversationManager.getAllTools(),
      'auto',
      conversationManager.stateManager ? conversationManager.stateManager.getContextInjection() : null
    );
  }
}

module.exports = { WhatsAppInboundRouter };
