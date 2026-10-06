const { ConversationManager } = require('../services/ConversationManager');
const { ToolRegistry } = require('../tools/ToolRegistry');
const { WhatsAppAutomationChannelAdapter } = require('./channelAdapter');
const { buildWhatsAppPrompt } = require('./promptBuilder');
const { store } = require('./sessionStore');

async function getOrCreateSession({ automation, connection, contactWaId, contactJid, provider, profileName }) {
  let entry = store.get(connection.id, contactWaId);
  if (entry) { store.touch(connection.id, contactWaId); return entry; }
  const adapter = new WhatsAppAutomationChannelAdapter({
    provider, contactWaId, contactJid, businessPhoneNumber: connection.phoneNumber, instanceId: connection.id,
  });
  adapter.contactProfileName = profileName || null;
  const manager = new ConversationManager(adapter, automation.providers || null, { textOnly: true });
  const registry = new ToolRegistry();
  for (const tool of automation.tools || []) {
    if (tool.enabled && tool.name && tool.schema) registry.registerCustom(tool.name, tool.schema);
  }
  manager.registry = registry;
  manager.toolExecutor.registry = registry;
  const config = {
    systemPrompt: buildWhatsAppPrompt(automation, { language: automation.language }),
    firstMessage: automation.initialMessage,
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
  await manager.startConversation(config, 'whatsapp');
  entry = { conversationManager: manager, adapter, contactWaId };
  await store.set(connection, automation, contactWaId, entry);
  return entry;
}

async function handleMessages({ automation, connection, provider, messages }) {
  const grouped = new Map();
  for (const message of messages || []) {
    if (message.from) grouped.set(message.from, [...(grouped.get(message.from) || []), message]);
  }
  for (const [contactWaId, contactMessages] of grouped) {
    const entry = await getOrCreateSession({
      automation, connection, contactWaId, provider,
      contactJid: contactMessages[0].jid,
      profileName: contactMessages[0].profileName,
    });
    for (const message of contactMessages) {
      if (message.type === 'text' || message.type === 'button' || message.type === 'list') {
        const text = (message.text || '').trim();
        if (text) await entry.conversationManager.handleUserUtterance(text);
      } else {
        await entry.conversationManager.handleUserUtterance(`[User sent a ${message.type || 'message'}]`);
      }
    }
  }
}

module.exports = { getOrCreateSession, handleMessages };
