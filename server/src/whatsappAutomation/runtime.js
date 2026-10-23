const { WhatsAppConversationManager } = require('./conversationManager');
const { buildRegistryForAutomation } = require('./tools');
const crm = require('./tools/crmService');

const { WhatsAppAutomationChannelAdapter } = require('./channelAdapter');
const { buildWhatsAppPrompt } = require('./promptBuilder');
const { normalizeWhatsAppResponse, extractPlainText } = require('./responseNormalizer');
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
  if (entry) {
    store.touch(connection.id, contactWaId);
    return { entry, isNew: false, persisted: null };
  }
  const persisted = await store.load(connection, automation, contactWaId);
  const isNew = !persisted;

  const adapter = new WhatsAppAutomationChannelAdapter({
    provider, contactWaId, contactJid, businessPhoneNumber: connection.phoneNumber, instanceId: connection.id,
    automationId: automation.id,
  });
  adapter.contactProfileName = profileName || null;
  adapter.sessionId = persisted?.id || null;

  const manager = new WhatsAppConversationManager(adapter, automation.providers || null);
  manager.sessionId = persisted?.id || null;
  manager.automationId = automation.id;
  manager.contactWaId = contactWaId;
  manager.timezone = automation.timezone;

  // Hydrate previous cumulative usage & cost from persisted session
  if (persisted) {
    if (persisted.llmCost) manager.usageTracker.usage.llmCost = Number(persisted.llmCost);
    if (persisted.llmPromptTokens) manager.usageTracker.usage.llmPromptTokens = Number(persisted.llmPromptTokens);
    if (persisted.llmCompletionTokens) manager.usageTracker.usage.llmCompletionTokens = Number(persisted.llmCompletionTokens);
    manager.usageTracker.updateTotalCost();
  }

  // Only tools in this registry are exposed to the LLM or executable.
  const registry = buildRegistryForAutomation(automation);
  manager.setRegistry(registry);
  manager.toolExecutor.automationId = automation.id;
  manager.toolExecutor.sessionId = persisted?.id || null;
  manager.toolExecutor.contactWaId = contactWaId;
  manager.toolExecutor.connectionId = connection.id;
  Object.assign(manager.toolExecutor.context, {
    workspaceId: automation.workspaceId,
    automationId: automation.id,
    timezone: automation.timezone,
    sessionId: persisted?.id || null,
    contactWaId,
    connectionId: connection.id,
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
    sessionId: persisted?.id || null,
  });

  // manager.start() initializes the LLM with the system prompt.
  // We pass firstMessage='' here — the caller (handleMessages) decides whether
  // to send the initialMessage or let the first_message auto-reply rule handle it.
  await manager.start({ ...config, firstMessage: persisted ? '' : '' });
  if (persisted) {
    manager.transcript.push(...persisted.transcript);
    manager.isHandoff = persisted.status === 'human_handoff';
    manager.isActive = !manager.isHandoff;
  }
  entry = {
    conversationManager: manager,
    adapter,
    contactWaId,
    sessionId: persisted?.id || null,
    status: persisted?.status || 'active',
    createdAt: persisted?.createdAt,
    // Signal to handleMessages that the initialMessage should be sent for this session.
    // handleMessages will decide whether to send it based on auto-reply rules.
    shouldSendInitialMessage: isNew && Boolean(config.firstMessage),
    initialMessage: config.firstMessage,
  };
  entry.status = entry.conversationManager.isHandoff ? 'human_handoff' : 'active';
  await store.set(connection, automation, contactWaId, entry);
  return { entry, isNew, persisted };
}

// `replay` is set by crash recovery: the messages were already claimed in the inbox.
async function handleMessages({ automation, connection, provider, messages, replay = false }) {
  if (!replay) {
    // STOP/START keywords update the campaign opt-out list; failures never block normal handling
    try {
      require('../campaigns').onInboundMessages({ automation, messages }).catch(() => {});
    } catch (err) {
      console.error('[WhatsAppAutomation] Campaign opt-out hook failed:', err.message);
    }
  }
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
    const { entry, isNew: isNewSession, persisted } = await getOrCreateSession({
      automation, connection, contactWaId, provider,
      contactJid: contactMessages[0].jid || contactWaId,
      profileName: contactMessages[0].profileName,
    });

    // Ensure contact exists and check opt-out compliance
    let crmContact = null;
    try {
      crmContact = await crm.ensureContact({
        automationId: automation.id,
        waId: contactWaId,
        name: contactMessages[0]?.profileName,
      });
    } catch (e) {
      console.warn('[WhatsAppAutomation] CRM ensureContact failed:', e.message);
    }

    // Determine if this turn is eligible for first_message (welcome) auto-reply.
    // A welcome rule should run if:
    // 1) The active transcript has no prior user messages (first turn in conversation), OR
    // 2) The session was stale or brand new, OR
    // 3) The contact sent an explicit greeting/starter (e.g. 'hi', 'hello', 'start', 'menu')
    //    and the conversation is not deep in an active multi-turn flow.
    const hasPriorUserMessages = Array.isArray(entry.conversationManager?.transcript) &&
      entry.conversationManager.transcript.some((m) => m.role === 'user');
    const isNewOrStaleSession = isNewSession || Boolean(persisted?.isStale);
    const GREETINGS = new Set(['hi', 'hello', 'hey', 'start', 'restart', 'menu', 'welcome', 'namaste', 'hola']);
    const firstMsgText = String(contactMessages[0]?.text || '').trim().toLowerCase();
    const isGreetingTurn = GREETINGS.has(firstMsgText);
    const isFirstContactMessage = isNewOrStaleSession || !hasPriorUserMessages || isGreetingTurn;

    // Send the initialMessage proactively for new sessions, UNLESS a first_message
    // auto-reply rule is configured (in which case that rule IS the welcome message).
    if (entry.shouldSendInitialMessage && !autoReplyService.hasFirstMessageRule()) {
      try {
        const normalized = normalizeWhatsAppResponse(entry.initialMessage);
        const displayContent = extractPlainText(normalized);
        entry.conversationManager.transcript.push({ role: 'assistant', content: displayContent, richResponse: normalized });
        await entry.adapter.sendResponse(normalized);
        await _incrementMessageCounter(connection.id, contactWaId, 'sent');
      } catch (err) {
        console.error('[WhatsAppAutomation] Failed to send initial message:', err.message);
      }
      entry.shouldSendInitialMessage = false;
    }

    const STOP_COMMANDS = new Set(['stop', 'unsubscribe', 'cancel', 'quit', 'optout', 'end']);
    const START_COMMANDS = new Set(['start', 'unstop', 'subscribe']);

    try {
      for (const [index, message] of contactMessages.entries()) {
      const rawText = String(message.text || '').trim().toLowerCase();

      // Handle STOP command
      if (STOP_COMMANDS.has(rawText)) {
        if (crmContact) await crm.updateContact(crmContact.id, { optedOut: true });
        await entry.adapter.sendText('You have been unsubscribed from automated messages. Reply START at any time to resume communication.');
        continue;
      }

      // Handle START command
      if (START_COMMANDS.has(rawText)) {
        if (crmContact) {
          await crm.updateContact(crmContact.id, { optedOut: false });
          crmContact.optedOut = false;
        }
        await entry.adapter.sendText('You have been resubscribed to messages. How can we help you today?');
        continue;
      }

      // If contact is opted out, suppress all automated replies
      if (crmContact?.optedOut) {
        console.log(`[WhatsAppAutomation] Suppressing automated reply for opted-out contact: ${contactWaId}`);
        continue;
      }


      // If this is genuinely the first message from a brand new contact on a new session,
      // AND there is no first_message auto-reply rule (which would respond for us),
      // AND the user's message has already been acknowledged by the initialMessage greeting,
      // skip generating an additional AI response — the greeting already covered it.
      if (isFirstContactMessage && index === 0 && entry.initialMessage && !autoReplyService.hasFirstMessageRule()) {
        const text = message.text || `[User sent a ${message.type || 'message'}]`;
        entry.conversationManager.transcript.push({ role: 'user', content: text });
        await store.set(connection, automation, contactWaId, entry);
        continue;
      }

      // Log incoming message (with graceful fallback if tables don't exist)
      let log = null;
      try {
        const inboundMessage = getIncomingLogMessage(message);
        log = WhatsAppAutomationLogService.build(automation.id, {
          connectionId: connection.id,
          contactWaId,
          sessionId: entry.sessionId || entry.id,
        });
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

      // Check for auto-reply BEFORE LLM (only trigger welcome rule on genuinely first contact message)
      const autoReplyResult = await _checkAutoReply({
        autoReplyService,
        message,
        automation,
        connection,
        contactWaId,
        entry,
        provider,
        log,
        isFirstMessage: isFirstContactMessage && index === 0,
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
    } finally {
      await store.set(connection, automation, contactWaId, entry).catch(() => {});
      if (inboxAvailable) await inbox.markDone(connection.id, messageIds).catch(() => {});
    }
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
  // For location, media (image/video/audio/document), and other types:
  // triggerType stays null — these cannot match keyword/button/list rules,
  // but 'always' and 'first_message' rules still apply.

  // Only bail early if there is no trigger AND this is not a first message.
  // 'always' rules still need a chance to run for any message type.
  const hasNoSpecificTrigger = !triggerType;
  if (hasNoSpecificTrigger && !isFirstMessage && !autoReplyService.hasAlwaysRule()) {
    return { handled: false };
  }

  const match = autoReplyService.match({ triggerType, triggerKey, triggerValue, userText, isFirstMessage });

  if (match.matched) {
    const matchedResponseText = getMessageText(match.response?.text || match.response?.body || match.response?.message || match.response?.value || match.response || '');
    const ruleLabel = match.rule.name || match.rule.triggerType;
    await log.info('auto_reply', 'matched', `Auto-reply rule matched: ${ruleLabel}`, {
      ruleId: match.rule.id,
      ruleName: match.rule.name,
      triggerType: match.rule.triggerType,
      triggerKey: match.rule.triggerKey,
      responseType: match.response._type,
      responseValue: matchedResponseText,
    });

    // Record the user's message in the LLM transcript even when auto-reply handles it.
    // This preserves conversation context if the user continues after an auto-reply.
    const userContent = getIncomingLogMessage(message) || `[User sent a ${message.type || 'message'}]`;
    entry.conversationManager.transcript.push({ role: 'user', content: userContent });
    entry.conversationManager.transcript.push({ role: 'assistant', content: matchedResponseText || '[Auto-reply sent]' });

    // Send the auto-reply response
    try {
      const { pre, response } = await autoReplyService.withAttachment(
        match.rule,
        match.response,
        typeof provider?.sendMessagePayload === 'function',
        log,
      );
      const replyCtx = { isAutoReply: true, ruleId: match.rule.id, ruleName: match.rule.name };
      for (const item of pre) await entry.adapter.sendResponse(item, replyCtx);
      await entry.adapter.sendResponse(response, replyCtx);

      await log.info('auto_reply', 'sent', matchedResponseText || `Sent auto-reply: ${ruleLabel}`, {
        ruleId: match.rule.id,
        ruleName: match.rule.name,
        triggerType: match.rule.triggerType,
        responseType: match.response._type,
        rawValue: matchedResponseText,
      });

      // Increment sent counter
      await _incrementMessageCounter(connection.id, contactWaId, 'sent');
    } catch (err) {
      await log.error('auto_reply', 'send_failed', `Failed to send auto-reply: ${err.message}`, {
        ruleId: match.rule.id,
        ruleName: match.rule.name,
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
