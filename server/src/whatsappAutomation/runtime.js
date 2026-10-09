const { WhatsAppConversationManager } = require('./conversationManager');
const { ToolRegistry } = require('../tools/ToolRegistry');
const { WhatsAppAutomationChannelAdapter } = require('./channelAdapter');
const { buildWhatsAppPrompt } = require('./promptBuilder');
const { store } = require('./sessionStore');

async function getOrCreateSession({ automation, connection, contactWaId, contactJid, provider, profileName }) {
  let entry = store.get(connection.id, contactWaId);
  if (entry) { store.touch(connection.id, contactWaId); return entry; }
  const persisted = await store.load(connection, automation, contactWaId);

  const adapter = new WhatsAppAutomationChannelAdapter({
    provider, contactWaId, contactJid, businessPhoneNumber: connection.phoneNumber, instanceId: connection.id,
  });
  adapter.contactProfileName = profileName || null;
  const manager = new WhatsAppConversationManager(adapter, automation.providers || null);
  const registry = new ToolRegistry();
  // The WhatsApp runtime uses the same internal CRM schemas as voice agents.
  // ToolExecutor handles these names directly, so registering the schemas here
  // gives the LLM a valid contract without creating a second tool system.
  // Standalone WhatsApp automations are not linked to an Agent, so the
  // legacy CRM executors cannot safely access availability or bookings.
  // Explicit webhook tools remain available below and can provide those
  // actions without relying on Agent-owned records.
  if (automation.agentId) registry.injectInternalCrmTools();
  const onboarding = automation.promptConfig?.onboarding || {};
  const enabledToolNames = new Set(
    (automation.tools || []).filter((tool) => tool.enabled !== false).map((tool) => tool.name)
  );
  const agentDependentTools = new Set([
    'check_availability', 'create_booking', 'get_bookings', 'cancel_booking',
    'reschedule_booking', 'transfer_call', 'send_followup_email', 'send_whatsapp',
    'get_pricing',
  ]);
  for (const name of ['check_availability', 'create_booking', 'get_bookings', 'cancel_booking', 'reschedule_booking', 'transfer_call', 'send_followup_email', 'send_whatsapp', 'get_pricing']) {
    if (!enabledToolNames.has(name)) registry.remove(name);
  }
  const collectionFields = onboarding.tools
    ?.find((tool) => tool.name === 'save_collected_data' && tool.enabled !== false)
    ?.config?.customerFields;
  if (Array.isArray(collectionFields) && collectionFields.length) {
    registry.injectDataCollectionTool(collectionFields);
  }
  for (const tool of automation.tools || []) {
    if (!tool.enabled || !tool.name || !tool.schema) continue;
    if (tool.config?.type === 'webhook' && tool.config?.webhookUrl) {
      // An explicitly configured webhook should replace the matching built-in
      // action rather than leaving duplicate function names in the LLM schema.
      registry.remove(tool.name);
      registry.registerWebhook(tool.name, tool.schema, tool.config);
    } else if (!automation.agentId && agentDependentTools.has(tool.name)) {
      // These names are implemented by Agent-owned CRM services. Do not
      // expose a tool that cannot execute in a standalone WhatsApp session.
      continue;
    } else if (!registry.isBuiltIn(tool.name)) {
      registry.registerCustom(tool.name, tool.schema);
    }
  }
  manager.registry = registry;
  manager.toolExecutor.registry = registry;
  manager.toolExecutor.agentId = automation.agentId || null;
  manager.toolExecutor.customToolFallback = true;

  const config = {
    systemPrompt: buildWhatsAppPrompt(automation, {
      language: automation.language,
      timezone: automation.timezone,
      toolNames: registry.getAllSchemas()
        .map(tool => tool.function?.name)
        .filter(Boolean),
    }, connection.provider),
    firstMessage: typeof automation.initialMessage === 'string'
      ? automation.initialMessage.trim()
      : '',
    assistantName: automation.businessName || automation.name,
    language: automation.language || 'en-US',
    timezone: automation.timezone,
    businessName: automation.businessName || automation.name,
    workspaceId: automation.workspaceId,
    contactWaId,
  };

  manager.toolExecutor.contactWaId = contactWaId;
  manager.toolExecutor.contactName = adapter.contactProfileName;
  manager.toolExecutor.contactProvider = connection.provider;

  await manager.start({ ...config, firstMessage: persisted ? '' : config.firstMessage });
  if (persisted) {
    manager.transcript.push(...persisted.transcript);
    manager.isHandoff = persisted.status === 'human_handoff';
    manager.isActive = !manager.isHandoff;
  }
  entry = {
    conversationManager: manager,
    adapter,
    contactWaId,
    status: persisted?.status || 'active',
    createdAt: persisted?.createdAt,
  };
  entry.status = entry.conversationManager.isHandoff ? 'human_handoff' : 'active';
  await store.set(connection, automation, contactWaId, entry);
  return entry;
}

async function handleMessages({ automation, connection, provider, messages }) {
  const initialMessage = typeof automation.initialMessage === 'string'
    ? automation.initialMessage.trim()
    : '';
  const grouped = new Map();
  for (const message of messages || []) {
    if (message.from) grouped.set(message.from, [...(grouped.get(message.from) || []), message]);
  }

  for (const [contactWaId, contactMessages] of grouped) {
    const isNewSession = !store.get(connection.id, contactWaId);
    const entry = await getOrCreateSession({
      automation, connection, contactWaId, provider,
      contactJid: contactMessages[0].jid || contactWaId,
      profileName: contactMessages[0].profileName,
    });

    for (const [index, message] of contactMessages.entries()) {
      // If this is the first message on a new session that has an initial greeting,
      // record the user's message without generating another AI reply.
      if (isNewSession && index === 0 && initialMessage) {
        const text = message.text || `[User sent a ${message.type || 'message'}]`;
        entry.conversationManager.transcript.push({ role: 'user', content: text });
        await store.set(connection, automation, contactWaId, entry);
        continue;
      }

      // Route based on message type
      if (message.type === 'interactive_response') {
        // Customer clicked a button, list row, or quick reply
        const interactionText = message.title || message.text || message.id || '';
        if (interactionText) {
          await entry.conversationManager.handleUserUtterance(interactionText, {
            interactionType: message.interactionType,
            id: message.id,
            title: message.title,
            description: message.description,
          });
        }
      } else if (message.type === 'text' || message.type === 'button' || message.type === 'list') {
        const text = (message.text || '').trim();
        if (text) await entry.conversationManager.handleUserUtterance(text);
      } else if (message.type === 'location') {
        const locText = [
          `[Customer shared location]`,
          message.location?.name ? `Name: ${message.location.name}` : null,
          message.location?.address ? `Address: ${message.location.address}` : null,
          `Coordinates: ${message.location?.latitude}, ${message.location?.longitude}`,
        ].filter(Boolean).join('\n');
        await entry.conversationManager.handleUserUtterance(locText);
      } else if (['image', 'video', 'audio', 'document'].includes(message.type)) {
        const caption = message.media?.caption || '';
        const userText = caption
          ? `[User sent a ${message.type} with caption: "${caption}"]`
          : `[User sent a ${message.type}]`;
        await entry.conversationManager.handleUserUtterance(userText);
      } else if (message.type === 'flow_reply') {
        const text = `[Customer completed WhatsApp Flow: ${message.name || 'flow'}]`;
        await entry.conversationManager.handleUserUtterance(text);
      } else {
        await entry.conversationManager.handleUserUtterance(`[User sent a ${message.type || 'message'}]`);
      }
    }
    await store.set(connection, automation, contactWaId, entry);
  }
}

module.exports = { getOrCreateSession, handleMessages };
