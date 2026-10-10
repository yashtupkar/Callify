const { WhatsAppConversationManager } = require('./conversationManager');
const { buildRegistryForAutomation } = require('./tools');

const { WhatsAppAutomationChannelAdapter } = require('./channelAdapter');
const { buildWhatsAppPrompt } = require('./promptBuilder');
const { store } = require('./sessionStore');
const { AutoReplyService } = require('./autoReplyService');
const { WhatsAppAutomationLogService } = require('./logService');
const { dbService } = require('../services/DatabaseService');
const { KeyedMutex, mapLimit, TtlDedup, RateLimiter } = require('./concurrency');

const inbox = require('./inbox');

const sessionMutex = new KeyedMutex();
const processedMessages = new TtlDedup({ ttlMs: 10 * 60 * 1000 });
const inboundLimiter = new RateLimiter({
  limit: Number(process.env.WHATSAPP_CONTACT_RATE_LIMIT || 30),
  windowMs: Number(process.env.WHATSAPP_CONTACT_RATE_WINDOW_MS || 60000),
});
const CONTACT_CONCURRENCY = Number(process.env.WHATSAPP_CONTACT_CONCURRENCY || 10);

function getMessageText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((item) => getMessageText(item)).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string' && value.text.trim()) return value.text.trim();
    if (typeof value.body === 'string' && value.body.trim()) return value.body.trim();
    if (typeof value.caption === 'string' && value.caption.trim()) return value.caption.trim();
    if (typeof value.message === 'string' && value.message.trim()) return value.message.trim();
    if (typeof value.title === 'string' && value.title.trim()) return value.title.trim();
    if (typeof value.value === 'string' && value.value.trim()) return value.value.trim();
    if (typeof value.content === 'string' && value.content.trim()) return value.content.trim();
    return JSON.stringify(value);
  }
  return String(value);
}

function getIncomingLogMessage(message) {
  if (!message) return '';
  if (message.type === 'interactive_response') {
    return getMessageText(message.title || message.text || message.body || message.value || message.id || message);
  }
  if (message.type === 'location') {
    const locationText = [
      message.location?.name,
      message.location?.address,
      message.location?.latitude !== undefined && message.location?.longitude !== undefined
        ? `Coordinates: ${message.location.latitude}, ${message.location.longitude}`
        : null,
    ].filter(Boolean).join(' | ');
    return locationText || getMessageText(message);
  }
  if (['image', 'video', 'audio', 'document'].includes(message.type)) {
    return getMessageText(message.media?.caption || message.caption || message);
  }
  return getMessageText(message.text || message.body || message.value || message.title || message.message || message);
}

async function getOrCreateSession({ automation, connection, contactWaId, contactJid, provider, profileName }) {
  let entry = store.get(connection.id, contactWaId);
  if (entry) { store.touch(connection.id, contactWaId); return entry; }
  const persisted = await store.load(connection, automation, contactWaId);

  const adapter = new WhatsAppAutomationChannelAdapter({
    provider, contactWaId, contactJid, businessPhoneNumber: connection.phoneNumber, instanceId: connection.id,
    automationId: automation.id,
  });
  adapter.contactProfileName = profileName || null;
  const manager = new WhatsAppConversationManager(adapter, automation.providers || null);
  // Only tools in this registry are exposed to the LLM or executable.
  const registry = buildRegistryForAutomation(automation);
  manager.setRegistry(registry);
  Object.assign(manager.toolExecutor.context, {
    workspaceId: automation.workspaceId,
    automationId: automation.id,
    timezone: automation.timezone,
  });
  const config = {
    systemPrompt: buildWhatsAppPrompt(automation, {
      language: automation.language,
      timezone: automation.timezone,
      toolNames: registry.names(),
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

  Object.assign(manager.toolExecutor.context, {
    contactWaId,
    contactName: adapter.contactProfileName,
    contactProvider: connection.provider,
    connectionId: connection.id,
  });

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

// `replay` is set by crash recovery: the messages were already claimed in the inbox.
async function handleMessages({ automation, connection, provider, messages, replay = false }) {
  const initialMessage = typeof automation.initialMessage === 'string'
    ? automation.initialMessage.trim()
    : '';
  const grouped = new Map();
  let inboxAvailable = true;
  for (const message of messages || []) {
    // Meta retries unacknowledged webhooks; drop messages that were already handled
    const dedupId = message.providerMessageId || message.wamid;
    if (dedupId && !replay) {
      // Fast in-process check first, then the shared DB claim (cross-instance, survives restarts)
      if (processedMessages.seen(`${connection.id}:${dedupId}`)) continue;
      if (inboxAvailable && message.from) {
        try {
          if (!(await inbox.claim(connection.id, { ...message, providerMessageId: dedupId }))) continue;
        } catch (err) {
          // Fail open on inbox outages (e.g. migration not applied) so customers still get replies
          inboxAvailable = false;
          console.error('[WhatsAppAutomation] Inbox unavailable, using in-memory dedup only:', err.message);
        }
      }
    }
    if (message.from) grouped.set(message.from, [...(grouped.get(message.from) || []), message]);
  }

  // Load auto-reply rules for this automation
  let autoReplyRules = [];
  try {
    autoReplyRules = await dbService.prisma.whatsAppAutoReplyRule.findMany({
      where: { automationId: automation.id, enabled: true },
      orderBy: { priority: 'asc' },
    });
  } catch (err) {
    if (err.code === 'P2021' || err.message?.includes('does not exist')) {
      console.warn('[WhatsAppAutomation] Auto-reply rules table not found, skipping auto-reply');
    } else {
      console.error('[WhatsAppAutomation] Failed to load auto-reply rules:', err.message);
    }
  }
  const autoReplyService = new AutoReplyService(autoReplyRules);

  const processContact = ([contactWaId, contactMessages]) => sessionMutex.run(`${connection.id}:${contactWaId}`, async () => {
    const messageIds = contactMessages.map((m) => m.providerMessageId || m.wamid);
    if (!(await _allowContact(connection.id, contactWaId, inboxAvailable && !replay))) {
      console.warn('[WhatsAppAutomation] Inbound rate limit exceeded, dropping messages', { connectionId: connection.id, count: contactMessages.length });
      if (inboxAvailable) await inbox.markDropped(connection.id, messageIds).catch(() => {});
      return;
    }
    const isNewSession = !store.get(connection.id, contactWaId);
    const entry = await getOrCreateSession({
      automation, connection, contactWaId, provider,
      contactJid: contactMessages[0].jid || contactWaId,
      profileName: contactMessages[0].profileName,
    });



    for (const [index, message] of contactMessages.entries()) {
      // If this is the first message on a new session that has an initial greeting,
      // record the user's message without generating another AI reply.
      if (isNewSession && index === 0 && initialMessage && !autoReplyService.hasFirstMessageRule()) {
        const text = message.text || `[User sent a ${message.type || 'message'}]`;
        entry.conversationManager.transcript.push({ role: 'user', content: text });
        await store.set(connection, automation, contactWaId, entry);
        continue;
      }

      // Log incoming message (with graceful fallback if tables don't exist)
      let log = null;
      try {
        const inboundMessage = getIncomingLogMessage(message);
        log = WhatsAppAutomationLogService.build(automation.id, { connectionId: connection.id, contactWaId });
        await log.info('message', 'incoming', inboundMessage || `Received ${message.type} message`, {
          messageType: message.type,
          messageId: message.id,
          rawValue: inboundMessage,
        });
      } catch (err) {
        if (err.code !== 'P2021' && !err.message?.includes('does not exist')) {
          console.error('[WhatsAppAutomation] Log error:', err.message);
        }
        // Create a no-op log object
        log = { info: async () => {}, warn: async () => {}, error: async () => {}, debug: async () => {} };
      }

      // Increment received counter
      await _incrementMessageCounter(connection.id, contactWaId, 'received');

      // Check for auto-reply BEFORE LLM
      const autoReplyResult = await _checkAutoReply({
        autoReplyService,
        message,
        automation,
        connection,
        contactWaId,
        entry,
        provider,
        log,
        isFirstMessage: isNewSession && index === 0,
      });
      
      if (autoReplyResult.handled) {
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
    if (inboxAvailable) await inbox.markDone(connection.id, messageIds).catch((err) => console.error('[WhatsAppAutomation] Inbox markDone failed:', err.message));
  });

  const results = await mapLimit([...grouped], CONTACT_CONCURRENCY, processContact);
  for (const result of results) {
    if (result.status === 'rejected') console.error('[WhatsAppAutomation] Contact processing failed:', result.reason?.message);
  }
}

const RATE_LIMIT = Number(process.env.WHATSAPP_CONTACT_RATE_LIMIT || 30);
const RATE_WINDOW_MS = Number(process.env.WHATSAPP_CONTACT_RATE_WINDOW_MS || 60000);

// Shared (DB) per-contact limit so scaling out does not multiply the allowance;
// falls back to the in-process limiter when the inbox is unavailable.
async function _allowContact(connectionId, contactWaId, useDb) {
  if (useDb) {
    try {
      return (await inbox.countRecent(connectionId, contactWaId, RATE_WINDOW_MS)) <= RATE_LIMIT;
    } catch (err) {
      console.error('[WhatsAppAutomation] DB rate limit failed, using in-memory limiter:', err.message);
    }
  }
  return inboundLimiter.allow(`${connectionId}:${contactWaId}`);
}

async function _checkAutoReply({ autoReplyService, message, automation, connection, contactWaId, entry, provider, log, isFirstMessage = false }) {
  let triggerType = null;
  let triggerKey = null;
  let triggerValue = null;
  let userText = null;

  if (message.type === 'interactive_response') {
    if (['button_reply', 'quick_reply'].includes(message.interactionType)) {
      triggerType = 'button_press';
      triggerKey = message.id;
      triggerValue = message.title;
    } else if (message.interactionType === 'list_reply') {
      triggerType = 'list_row';
      triggerKey = message.id;
      triggerValue = message.title;
    } else if (message.interactionType === 'flow_reply') {
      triggerType = 'flow_reply';
      triggerKey = message.name || 'flow';
      triggerValue = message.name || 'flow';
    }
  } else if (message.type === 'text' || message.type === 'button' || message.type === 'list') {
    triggerType = 'keyword';
    triggerKey = 'keyword';
    userText = (message.text || '').trim().toLowerCase();
  } else if (message.type === 'flow_reply') {
    triggerType = 'flow_reply';
    triggerKey = message.name || 'flow';
    triggerValue = message.name || 'flow';
  }

  if (!triggerType && !isFirstMessage) return { handled: false };

  const match = autoReplyService.match({ triggerType, triggerKey, triggerValue, userText, isFirstMessage });

  if (match.matched) {
    const matchedResponseText = getMessageText(match.response?.text || match.response?.body || match.response?.message || match.response?.value || match.response || '');
    await log.info('auto_reply', 'matched', `Auto-reply rule matched: ${match.rule.triggerType}`, {
      ruleId: match.rule.id,
      triggerType: match.rule.triggerType,
      triggerKey: match.rule.triggerKey,
      responseType: match.response._type,
      responseValue: matchedResponseText,
    });

    // Send the auto-reply response
    try {
      const { pre, response } = await autoReplyService.withAttachment(
        match.rule,
        match.response,
        typeof provider?.sendMessagePayload === 'function',
        log,
      );
      for (const item of pre) await entry.adapter.sendResponse(item);
      await entry.adapter.sendResponse(response);
      
      // Increment sent counter
      await _incrementMessageCounter(connection.id, contactWaId, 'sent');
    } catch (err) {
      await log.error('auto_reply', 'send_failed', `Failed to send auto-reply`, {
        ruleId: match.rule.id,
        error: err.message,
      });
      await _incrementMessageCounter(connection.id, contactWaId, 'failed');
    }

    return { handled: true };
  }

  return { handled: false };
}

async function _incrementMessageCounter(connectionId, contactWaId, type) {
  try {
    const fieldMap = {
      sent: 'messagesSent',
      received: 'messagesReceived',
      failed: 'messagesFailed',
    };
    const field = fieldMap[type];
    if (!field) return;

    await dbService.prisma.whatsAppAutomationSession.updateMany({
      where: { connectionId, contactWaId },
      data: { [field]: { increment: 1 } },
    });
  } catch (err) {
    console.error('[WhatsAppAutomation] Failed to increment message counter:', err.message);
  }
}

module.exports = { getOrCreateSession, handleMessages };
